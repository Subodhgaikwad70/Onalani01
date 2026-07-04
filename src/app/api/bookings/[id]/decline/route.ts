import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureBeds24BookingCancelled } from "@/lib/beds24/cancel-booking";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

/** POST /api/bookings/{id}/decline — staff declines a request-to-book. */
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

  if (booking.status !== "requested") {
    return jsonError(409, "Only booking requests awaiting approval can be declined");
  }

  await admin
    .from("booking_holds")
    .delete()
    .eq("listing_id", booking.listing_id)
    .eq("guest_id", booking.guest_id)
    .eq("check_in", booking.check_in)
    .eq("check_out", booking.check_out);

  const { data: updated, error: updErr } = await admin
    .from("bookings")
    .update({ status: "declined" })
    .eq("id", bookingId)
    .eq("status", "requested")
    .select("*")
    .single();
  if (updErr) return jsonError(400, updErr.message);

  const beds24RoomId = (
    booking.listings as { beds24_room_id?: string | null } | null
  )?.beds24_room_id;
  await ensureBeds24BookingCancelled({
    admin,
    booking: {
      id: booking.id as string,
      code: booking.code as string,
      check_in: booking.check_in as string,
      check_out: booking.check_out as string,
      listing_id: booking.listing_id as string,
      beds24_booking_id: booking.beds24_booking_id as string | null,
    },
    beds24RoomId,
    cancelledBy: "declined",
  });

  await admin.from("notifications").insert({
    recipient_id: booking.guest_id as string,
    kind: "booking_request_declined",
    title: "Booking request declined",
    body: `Your request for booking ${booking.code} was declined.`,
    link: `/account/trips`,
    payload: { booking_id: booking.id, code: booking.code },
  });

  await admin
    .from("booking_requests")
    .update({
      decided_at: new Date().toISOString(),
      decision: "declined",
    })
    .eq("booking_id", bookingId);

  await syncBookingToAdminInbox(admin, {
    bookingId,
    event: "declined",
  });

  return Response.json({ booking: updated });
});
