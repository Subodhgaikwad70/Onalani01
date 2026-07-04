/**
 * Sync Onalani bookings to Beds24.
 * - Request-to-book → Beds24 status "request" after payment.
 * - Instant book / admin approval → Beds24 status "confirmed".
 * Platform Stripe: create/link only after payment (or zero-balance checkout).
 * Invoice lines sync from actual Stripe payments (see sync-booking-financial).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelBeds24Booking,
  createBeds24Booking,
  findBeds24BookingsByStay,
  updateBeds24Booking,
  type Beds24BookingStatus,
} from "@/lib/beds24/client";
import {
  buildBeds24BookingNotes,
  syncBeds24BookingFinancialFromPayments,
} from "@/lib/beds24/sync-booking-financial";
import { invalidateRange } from "@/lib/beds24/cache";

const CONFIRMED_STATUSES = new Set(["confirmed", "in_stay"]);
const REQUEST_STATUSES = new Set(["requested"]);

async function resolveGuestContact(
  admin: SupabaseClient,
  guestId: string,
): Promise<{ firstName: string; lastName: string; email: string }> {
  const [{ data: profile }, { data: authData }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", guestId).maybeSingle(),
    admin.auth.admin.getUserById(guestId),
  ]);

  const displayName = profile?.display_name ?? "Guest";
  const parts = displayName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "Guest",
    lastName: parts.slice(1).join(" ") || "Guest",
    email: authData.user?.email ?? "guest@onalani.com",
  };
}

async function invalidateBookingCalendarCache(
  admin: SupabaseClient,
  booking: {
    listing_id: string;
    check_in: string;
    check_out: string;
  },
): Promise<void> {
  try {
    await invalidateRange(booking.listing_id, {
      from: booking.check_in,
      to: booking.check_out,
    });
  } catch (e) {
    console.warn("[beds24-sync] cache invalidation failed", e);
  }
}

function targetBeds24Status(
  onalaniStatus: string,
): Beds24BookingStatus | null {
  if (CONFIRMED_STATUSES.has(onalaniStatus)) return "confirmed";
  if (REQUEST_STATUSES.has(onalaniStatus)) return "request";
  return null;
}

async function linkOrReuseBeds24Booking(input: {
  admin: SupabaseClient;
  bookingId: string;
  bookingCode: string;
  beds24RoomId: string;
  arrival: string;
  departure: string;
  beds24Status: Beds24BookingStatus;
  note: string;
  guest: { firstName: string; lastName: string; email: string };
}): Promise<string | null> {
  const matches = await findBeds24BookingsByStay({
    roomId: input.beds24RoomId,
    arrival: input.arrival,
    departure: input.departure,
  });

  const forCode = matches.filter(
    (row) => row.custom1 === input.bookingCode && row.status !== "cancelled",
  );

  if (forCode.length > 0) {
    const primary = forCode[0]!;
    await updateBeds24Booking({
      id: primary.id,
      status: input.beds24Status,
      notes: input.note,
      guestFirstName: input.guest.firstName,
      guestLastName: input.guest.lastName,
      guestEmail: input.guest.email,
    });
    await input.admin
      .from("bookings")
      .update({ beds24_booking_id: primary.id })
      .eq("id", input.bookingId);

    for (const duplicate of forCode.slice(1)) {
      try {
        await cancelBeds24Booking(duplicate.id);
      } catch (e) {
        console.warn("[beds24-sync] could not cancel duplicate", duplicate.id, e);
      }
    }

    return primary.id;
  }

  return null;
}

async function syncInvoiceFromPayments(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    await syncBeds24BookingFinancialFromPayments(admin, bookingId);
  } catch (e) {
    console.error("[beds24-sync] invoice sync from payments failed", e);
  }
}

/**
 * Create, link, or upgrade a Beds24 reservation for a linked listing.
 * Skips when payment ran through Beds24 Stripe (booking already exists there).
 */
export async function ensureBeds24BookingSynced(
  admin: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id)")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return null;

  if (booking.payment_provider === "beds24_stripe") {
    if (booking.beds24_booking_id) {
      await syncInvoiceFromPayments(admin, bookingId);
    }
    return booking.beds24_booking_id
      ? String(booking.beds24_booking_id)
      : null;
  }

  const beds24RoomId = (
    booking.listings as { beds24_room_id?: string | null } | null
  )?.beds24_room_id;
  if (!beds24RoomId) return null;

  const onalaniStatus = String(booking.status);
  const beds24Status = targetBeds24Status(onalaniStatus);
  if (!beds24Status) return null;

  const noteKind = beds24Status === "request" ? "request" : "confirmed";
  const note = buildBeds24BookingNotes(booking, noteKind);
  const guest = await resolveGuestContact(admin, booking.guest_id as string);

  if (booking.beds24_booking_id) {
    await updateBeds24Booking({
      id: String(booking.beds24_booking_id),
      ...(beds24Status === "confirmed" ? { status: "confirmed" } : {}),
      notes: note,
      guestFirstName: guest.firstName,
      guestLastName: guest.lastName,
      guestEmail: guest.email,
    });
    await invalidateBookingCalendarCache(admin, {
      listing_id: booking.listing_id as string,
      check_in: booking.check_in as string,
      check_out: booking.check_out as string,
    });
    await syncInvoiceFromPayments(admin, bookingId);
    return String(booking.beds24_booking_id);
  }

  let linked: string | null = null;
  try {
    linked = await linkOrReuseBeds24Booking({
      admin,
      bookingId,
      bookingCode: booking.code as string,
      beds24RoomId,
      arrival: booking.check_in as string,
      departure: booking.check_out as string,
      beds24Status,
      note,
      guest,
    });
  } catch (e) {
    console.warn("[beds24-sync] lookup failed, will create new booking", e);
  }
  if (linked) {
    await invalidateBookingCalendarCache(admin, {
      listing_id: booking.listing_id as string,
      check_in: booking.check_in as string,
      check_out: booking.check_out as string,
    });
    await syncInvoiceFromPayments(admin, bookingId);
    return linked;
  }

  const result = await createBeds24Booking({
    roomId: beds24RoomId,
    arrival: booking.check_in as string,
    departure: booking.check_out as string,
    numAdult: Number(booking.adults),
    numChild: Number(booking.children),
    guestFirstName: guest.firstName,
    guestLastName: guest.lastName,
    guestEmail: guest.email,
    externalRef: booking.code as string,
    notes: note,
    status: beds24Status,
  });

  await admin
    .from("bookings")
    .update({ beds24_booking_id: result.id })
    .eq("id", bookingId);

  await invalidateBookingCalendarCache(admin, {
    listing_id: booking.listing_id as string,
    check_in: booking.check_in as string,
    check_out: booking.check_out as string,
  });

  await syncInvoiceFromPayments(admin, bookingId);
  return result.id;
}
