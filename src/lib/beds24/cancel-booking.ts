/**
 * Cancel (or delete) a Beds24 reservation for a linked Onalani booking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelBeds24Booking,
  findBeds24BookingsByStay,
} from "@/lib/beds24/client";
import { invalidateRange } from "@/lib/beds24/cache";

export type Beds24CancelBookingInput = {
  admin: SupabaseClient;
  booking: {
    id: string;
    code: string;
    check_in: string;
    check_out: string;
    listing_id: string;
    beds24_booking_id?: string | null;
  };
  beds24RoomId: string | null | undefined;
  /** e.g. "guest", "admin", "declined" */
  cancelledBy?: string;
};

export type Beds24CancelBookingResult = {
  /** True when listing has no Beds24 room — nothing to do. */
  skipped: boolean;
  /** Beds24 reservation ids we attempted to cancel. */
  beds24BookingIds: string[];
  /** True when at least one Beds24 reservation was cancelled/deleted. */
  cancelled: boolean;
};

async function invalidateBookingCalendarCache(
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  try {
    await invalidateRange(listingId, { from: checkIn, to: checkOut });
  } catch (e) {
    console.warn("[beds24-cancel] cache invalidation failed", e);
  }
}

async function resolveBeds24BookingIds(input: {
  beds24RoomId: string;
  bookingCode: string;
  arrival: string;
  departure: string;
  storedId?: string | null;
}): Promise<string[]> {
  if (input.storedId) {
    return [String(input.storedId)];
  }

  try {
    const matches = await findBeds24BookingsByStay({
      roomId: input.beds24RoomId,
      arrival: input.arrival,
      departure: input.departure,
    });
    return matches
      .filter(
        (row) =>
          row.custom1 === input.bookingCode &&
          row.status?.toLowerCase() !== "cancelled",
      )
      .map((row) => row.id);
  } catch (e) {
    console.warn("[beds24-cancel] lookup failed", e);
    return [];
  }
}

/**
 * Cancel Beds24 reservations for a linked listing.
 * Resolves by `beds24_booking_id` or stay window + booking code.
 */
export async function ensureBeds24BookingCancelled(
  input: Beds24CancelBookingInput,
): Promise<Beds24CancelBookingResult> {
  const { admin, booking, beds24RoomId, cancelledBy } = input;
  if (!beds24RoomId) {
    return { skipped: true, beds24BookingIds: [], cancelled: false };
  }

  const beds24BookingIds = await resolveBeds24BookingIds({
    beds24RoomId,
    bookingCode: booking.code,
    arrival: booking.check_in,
    departure: booking.check_out,
    storedId: booking.beds24_booking_id,
  });

  if (beds24BookingIds.length === 0) {
    return { skipped: false, beds24BookingIds: [], cancelled: false };
  }

  let cancelled = false;
  for (const beds24Id of beds24BookingIds) {
    try {
      await cancelBeds24Booking(beds24Id);
      cancelled = true;
    } catch (e) {
      console.error(
        `[beds24-cancel] failed for Onalani ${booking.code} / Beds24 ${beds24Id}`,
        cancelledBy ? `(by ${cancelledBy})` : "",
        e,
      );
    }
  }

  if (cancelled) {
    await invalidateBookingCalendarCache(
      booking.listing_id,
      booking.check_in,
      booking.check_out,
    );

    if (!booking.beds24_booking_id && beds24BookingIds[0]) {
      await admin
        .from("bookings")
        .update({ beds24_booking_id: beds24BookingIds[0] })
        .eq("id", booking.id);
    }
  }

  return { skipped: false, beds24BookingIds, cancelled };
}
