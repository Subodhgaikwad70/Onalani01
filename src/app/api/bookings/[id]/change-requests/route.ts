import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { jsonError } from "@/lib/auth/session";
import {
  approveBookingChangeRequest,
  assertBookingChangeable,
  changeRequestFieldsSchema,
  computeChangeQuote,
  type BookingForChange,
} from "@/lib/bookings/change-request";
import { notifyChangePayment } from "@/lib/bookings/change-request-payment";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bookingIdentifierLookup,
  bookingPublicIdentifier,
} from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

const createBodySchema = changeRequestFieldsSchema.extend({
  preview: z.boolean().optional(),
  /** Admin only: apply changes immediately without a separate approval step. */
  apply_immediately: z.boolean().optional(),
});

async function loadBooking(
  admin: ReturnType<typeof createSupabaseAdmin>,
  identifier: string,
) {
  const lookup = bookingIdentifierLookup(identifier);
  const { data, error } = await admin
    .from("bookings")
    .select("*")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BookingForChange | null;
}

/** GET /api/bookings/{id}/change-requests */
export const GET = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const booking = await loadBooking(admin, id);
  if (!booking) return jsonError(404, "Booking not found");

  const isGuest = booking.guest_id === session.user.id;
  const isStaff = isAdminRole(session.role);
  if (!isGuest && !isStaff) return jsonError(403, "Forbidden");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_change_requests")
    .select("*")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return jsonError(500, error.message);

  return Response.json({ change_requests: data ?? [] });
});

/** POST /api/bookings/{id}/change-requests — preview or submit a modification. */
export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data: body, error } = await parseJsonBody(req, createBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const booking = await loadBooking(admin, id);
  if (!booking) return jsonError(404, "Booking not found");

  const isGuest = booking.guest_id === session.user.id;
  const isStaff = isAdminRole(session.role);
  if (!isGuest && !isStaff) return jsonError(403, "Forbidden");
  const bookingId = booking.id;
  const publicBookingId = bookingPublicIdentifier(booking);

  try {
    assertBookingChangeable(booking.status);
  } catch (e) {
    return jsonError(409, e instanceof Error ? e.message : "Cannot modify");
  }

  try {
    const quote = await computeChangeQuote(admin, booking, body);

    if (body.preview) {
      const currentQuoteTotal =
        Number(booking.total_cents) +
        Number(booking.credit_applied_cents ?? 0);
      return Response.json({
        preview: {
          ...quote,
          currency: booking.currency,
          current_total_cents: currentQuoteTotal,
          current_cash_due_cents: booking.total_cents,
        },
      });
    }

    const { data: existingPending } = await admin
      .from("booking_change_requests")
      .select("id")
      .eq("booking_id", bookingId)
      .in("status", ["pending", "approved_pending_payment"])
      .maybeSingle();
    if (existingPending) {
      return jsonError(
        409,
        "A change request is already pending or awaiting payment. Complete or withdraw it before submitting another.",
      );
    }

    const requestedByRole = isStaff ? "admin" : "guest";
    const guestNotes =
      body.guest_notes !== undefined ? body.guest_notes : booking.guest_notes;

    const { data: changeRequest, error: insertErr } = await admin
      .from("booking_change_requests")
      .insert({
        booking_id: bookingId,
        requested_by: session.user.id,
        requested_by_role: requestedByRole,
        status: "pending",
        check_in: body.check_in,
        check_out: body.check_out,
        adults: body.guests.adults,
        children: body.guests.children,
        infants: body.guests.infants,
        pets: body.guests.pets,
        guest_notes: guestNotes,
        subtotal_cents: quote.breakdown.subtotal_cents,
        cleaning_fee_cents: quote.cleaning_fee_cents,
        extra_guest_fee_cents: quote.extra_guest_fee_cents,
        service_fee_cents: quote.service_fee_cents,
        taxes_cents: quote.breakdown.taxes_total_cents,
        total_cents: quote.total_cents,
        currency: booking.currency,
        pricing_breakdown: quote.breakdown,
        message: body.message?.trim() || null,
      })
      .select("*")
      .single();
    if (insertErr) return jsonError(400, insertErr.message);

    const applyNow = isStaff && body.apply_immediately === true;

    if (applyNow) {
      const approveResult = await approveBookingChangeRequest(
        admin,
        booking,
        changeRequest,
        session.user.id,
      );
      await notifyChangePayment(admin, booking, approveResult.payment ?? { delta_cents: 0 }, {
        awaiting_payment: approveResult.requires_payment,
      });

      const finalStatus = approveResult.requires_payment
        ? "approved_pending_payment"
        : "approved";

      await admin
        .from("booking_change_requests")
        .update({
          status: finalStatus,
          decided_by: session.user.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", changeRequest.id);

      if (approveResult.applied) {
        await admin.from("notifications").insert({
          recipient_id: booking.guest_id,
          kind: "booking_updated",
          title: "Your reservation was updated",
          body: `Booking ${booking.code} dates and guest details were updated by our team.`,
          link: `/account/trips/${publicBookingId}`,
          payload: { booking_id: booking.id, change_request_id: changeRequest.id },
        });
      }

      await syncBookingToAdminInbox(admin, {
        bookingId,
        event: "change_approved",
      });

      return Response.json({
        change_request: { ...changeRequest, status: finalStatus },
        applied: approveResult.applied,
        requires_payment: approveResult.requires_payment,
        checkout_url: approveResult.requires_payment
          ? `/checkout/${publicBookingId}`
          : null,
      });
    }

    await syncBookingToAdminInbox(admin, {
      bookingId,
      event: "change_requested",
    });

    if (isGuest) {
      await admin.from("notifications").insert({
        recipient_id: booking.guest_id,
        kind: "change_request_submitted",
        title: "Change request submitted",
        body: `We received your requested changes for booking ${booking.code}. You'll be notified when they're reviewed.`,
        link: `/account/trips/${publicBookingId}`,
        payload: { booking_id: booking.id, change_request_id: changeRequest.id },
      });
    }

    return Response.json({ change_request: changeRequest, applied: false });
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "Invalid change request");
  }
});
