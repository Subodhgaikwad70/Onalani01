/**
 * When a listing uses Beds24 inventory, synced reservations are already
 * reflected in `numAvail`. Only subtract local rows that are not yet in Beds24.
 */
export function shouldSubtractLocalBooking(
  booking: {
    status?: string | null;
    beds24_booking_id?: string | null;
    created_at?: string | null;
  },
  beds24RoomLinked: boolean,
  stalePendingCutoffIso: string,
): boolean {
  if (!beds24RoomLinked) return true;

  const status = String(booking.status ?? "");
  if (status === "pending_payment") {
    if (booking.created_at && booking.created_at < stalePendingCutoffIso) {
      return false;
    }
    return true;
  }

  if (booking.beds24_booking_id) {
    return false;
  }

  return ["requested", "confirmed", "in_stay"].includes(status);
}
