/**
 * Push booking modifications to Beds24 (dates, guests, invoice from payments).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateRange } from "@/lib/beds24/cache";
import { updateBeds24Booking } from "@/lib/beds24/client";
import {
  buildBeds24BookingNotes,
  syncBeds24BookingFinancialFromPayments,
} from "@/lib/beds24/sync-booking-financial";
import { ensureBeds24BookingSynced } from "@/lib/beds24/sync-booking";

export type Beds24BookingChangeSnapshot = {
  check_in: string;
  check_out: string;
  listing_id: string;
};

export async function syncBeds24AfterBookingChange(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    previous: Beds24BookingChangeSnapshot;
  },
): Promise<{ synced: boolean; beds24_booking_id?: string }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id)")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return { synced: false };

  const beds24RoomId = (
    booking.listings as { beds24_room_id?: string | null } | null
  )?.beds24_room_id;
  if (!beds24RoomId) return { synced: false };

  let beds24BookingId = booking.beds24_booking_id as string | null;
  if (!beds24BookingId) {
    beds24BookingId = await ensureBeds24BookingSynced(admin, input.bookingId);
  }
  if (!beds24BookingId) {
    console.warn(
      `[beds24-change] booking ${booking.code} has no beds24_booking_id — skip sync`,
    );
    return { synced: false };
  }

  await updateBeds24Booking({
    id: beds24BookingId,
    arrival: booking.check_in as string,
    departure: booking.check_out as string,
    numAdult: Number(booking.adults),
    numChild: Number(booking.children),
    notes: buildBeds24BookingNotes(booking, "modified"),
  });

  try {
    await syncBeds24BookingFinancialFromPayments(admin, input.bookingId);
  } catch (e) {
    console.error("[beds24-change] invoice sync from payments failed", e);
  }

  const listingId = booking.listing_id as string;
  const ranges = [
    { from: input.previous.check_in, to: input.previous.check_out },
    { from: booking.check_in as string, to: booking.check_out as string },
  ];
  for (const range of ranges) {
    try {
      await invalidateRange(listingId, range);
    } catch (e) {
      console.warn("[beds24-change] cache invalidation failed", e);
    }
  }

  return { synced: true, beds24_booking_id: beds24BookingId };
}
