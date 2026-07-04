import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureBeds24BookingSynced } from "@/lib/beds24/sync-booking";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import {
  bookingIdentifierLookup,
  bookingPublicIdentifier,
} from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

/**
 * POST /api/bookings/{id}/approve — staff accepts a paid request-to-book.
 * Payment was collected at checkout before the request was sent.
 */
export const POST = requireAdmin<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);

  const { data: booking, error: lookupError } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id)")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (lookupError) return jsonError(500, lookupError.message);
  if (!booking) return jsonError(404, "Booking not found");
  const bookingId = booking.id as string;
  const publicBookingId = bookingPublicIdentifier(booking);

  if (booking.status !== "requested") {
    return jsonError(409, "Only booking requests awaiting approval can be approved");
  }

  const { data: charge } = await admin
    .from("payment_history")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .maybeSingle();
  if (!charge && Number(booking.total_cents) > 0) {
    return jsonError(
      409,
      "No payment on file for this request; guest must complete checkout first",
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("bookings")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("status", "requested")
    .select("*")
    .single();
  if (updErr) return jsonError(400, updErr.message);

  try {
    await ensureBeds24BookingSynced(admin, bookingId);
  } catch (e) {
    console.error("[bookings/approve] Beds24 sync failed", e);
  }

  await admin.from("notifications").insert({
    recipient_id: booking.guest_id as string,
    kind: "booking_confirmed",
    title: "Your stay is confirmed",
    body: `Booking ${booking.code} was approved by the host.`,
    link: `/account/trips/${publicBookingId}`,
    payload: { booking_id: booking.id, code: booking.code },
  });

  await admin
    .from("booking_requests")
    .update({
      decided_at: new Date().toISOString(),
      decision: "approved",
    })
    .eq("booking_id", bookingId);

  await syncBookingToAdminInbox(admin, {
    bookingId,
    event: "confirmed",
  });

  return Response.json({ booking: updated });
});
