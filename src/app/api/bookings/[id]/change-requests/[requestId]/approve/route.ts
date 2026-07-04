import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import {
  approveBookingChangeRequest,
  assertBookingChangeable,
  type BookingForChange,
} from "@/lib/bookings/change-request";
import { notifyChangePayment } from "@/lib/bookings/change-request-payment";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  bookingIdentifierLookup,
  bookingPublicIdentifier,
} from "@/lib/bookings/booking-identifiers";

type Params = { id: string; requestId: string };

/** POST /api/bookings/{id}/change-requests/{requestId}/approve */
export const POST = requireAdmin<Params>(async (_req, ctx, session) => {
  const { id, requestId } = await ctx.params;
  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("*")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (bookingErr) return jsonError(500, bookingErr.message);
  if (!booking) return jsonError(404, "Booking not found");
  const bookingId = booking.id as string;
  const publicBookingId = bookingPublicIdentifier(booking);

  try {
    assertBookingChangeable(booking.status);
  } catch (e) {
    return jsonError(409, e instanceof Error ? e.message : "Cannot modify");
  }

  const { data: changeRequest, error: reqErr } = await admin
    .from("booking_change_requests")
    .select("*")
    .eq("id", requestId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (reqErr) return jsonError(500, reqErr.message);
  if (!changeRequest) return jsonError(404, "Change request not found");
  if (changeRequest.status !== "pending") {
    return jsonError(409, "Only pending change requests can be approved");
  }

  let result;
  try {
    result = await approveBookingChangeRequest(
      admin,
      booking as BookingForChange,
      changeRequest,
      session.user.id,
    );
    await notifyChangePayment(admin, booking, result.payment ?? { delta_cents: 0 }, {
      awaiting_payment: result.requires_payment,
    });
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "Could not apply changes");
  }

  if (result.applied) {
    await admin
      .from("booking_change_requests")
      .update({
        status: "approved",
        decided_by: session.user.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }

  const { data: updated, error: updErr } = await admin
    .from("booking_change_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (updErr) return jsonError(400, updErr.message);

  if (result.applied) {
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "change_request_approved",
      title: "Change request approved",
      body: `Your requested updates for booking ${booking.code} are now confirmed.`,
      link: `/account/trips/${publicBookingId}`,
      payload: { booking_id: booking.id, change_request_id: requestId },
    });
  }

  await syncBookingToAdminInbox(admin, {
    bookingId,
    event: "change_approved",
  });

  const { data: refreshedBooking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  return Response.json({
    change_request: updated,
    booking: refreshedBooking,
    applied: result.applied,
    requires_payment: result.requires_payment,
    payment: result.payment ?? null,
    checkout_url: result.requires_payment ? `/checkout/${publicBookingId}` : null,
  });
});
