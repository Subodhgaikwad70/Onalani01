/**
 * Transition a booking after successful payment.
 * Instant book → confirmed. Request-to-book → requested (payment already collected).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureBeds24BookingSynced } from "@/lib/beds24/sync-booking";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { fulfillRecoveryCreditsForBooking } from "@/lib/bookings/cancellation-recovery";

const REQUEST_EXPIRY_DAYS = 7;

export type FinalizePaymentInput = {
  bookingId: string;
  chargeAmountCents: number;
  currency: string;
  stripeObjectId: string;
  paymentMetadata?: Record<string, unknown>;
  paymentCardLast4?: string | null;
  paymentCardBrand?: string | null;
};

async function ensureBookingRequestRow(
  admin: SupabaseClient,
  bookingId: string,
  guestNotes: string | null,
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await admin
    .from("booking_requests")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existing) return;

  await admin.from("booking_requests").insert({
    booking_id: bookingId,
    message: guestNotes,
    expires_at: expiresAt,
  });
}

export async function finalizeBookingAfterPayment(
  admin: SupabaseClient,
  input: FinalizePaymentInput,
): Promise<{ status: "confirmed" | "requested"; alreadyFinalized: boolean }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id)")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Booking not found");

  if (booking.status === "confirmed" || booking.status === "in_stay") {
    return { status: "confirmed", alreadyFinalized: true };
  }
  if (booking.status === "requested") {
    return { status: "requested", alreadyFinalized: true };
  }
  if (booking.status !== "pending_payment") {
    throw new Error(`Cannot finalize booking in status ${booking.status}`);
  }

  const targetStatus = booking.is_instant_book ? "confirmed" : "requested";

  await admin
    .from("bookings")
    .update({
      status: targetStatus,
      ...(targetStatus === "confirmed"
        ? { confirmed_at: new Date().toISOString() }
        : {}),
      stripe_charge_id: input.stripeObjectId,
      ...(input.paymentCardLast4
        ? {
            payment_card_last4: input.paymentCardLast4,
            payment_card_brand: input.paymentCardBrand ?? null,
          }
        : {}),
    })
    .eq("id", input.bookingId)
    .eq("status", "pending_payment");

  const { data: existingCharge } = await admin
    .from("payment_history")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("kind", "charge")
    .maybeSingle();

  if (!existingCharge) {
    await admin.from("payment_history").insert({
      booking_id: input.bookingId,
      guest_id: booking.guest_id,
      kind: "charge",
      amount_cents: input.chargeAmountCents,
      currency: input.currency,
      stripe_object_id: input.stripeObjectId,
      metadata: input.paymentMetadata ?? {},
    });
  }

  if (targetStatus === "requested") {
    await ensureBookingRequestRow(
      admin,
      input.bookingId,
      booking.guest_notes as string | null,
    );
    try {
      await ensureBeds24BookingSynced(admin, input.bookingId);
    } catch (e) {
      console.error("[finalize-payment] Beds24 request sync failed", e);
    }
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "booking_request_sent",
      title: "Booking request sent",
      body: `Your paid request for booking ${booking.code} was sent to the host.`,
      link: `/account/trips/${booking.code}`,
      payload: { booking_id: booking.id, code: booking.code },
    });
    await syncBookingToAdminInbox(admin, {
      bookingId: input.bookingId,
      event: "requested",
    });
  } else {
    try {
      await ensureBeds24BookingSynced(admin, input.bookingId);
    } catch (e) {
      console.error("[finalize-payment] Beds24 sync failed", e);
    }
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "booking_confirmed",
      title: "Your stay is confirmed",
      body: `Booking ${booking.code} is confirmed.`,
      link: `/account/trips/${booking.code}`,
      payload: { booking_id: booking.id, code: booking.code },
    });
    await syncBookingToAdminInbox(admin, {
      bookingId: input.bookingId,
      event: "confirmed",
    });
    try {
      await fulfillRecoveryCreditsForBooking(admin, {
        bookingId: input.bookingId,
        listingId: booking.listing_id as string,
        checkIn: booking.check_in as string,
        checkOut: booking.check_out as string,
        subtotalCents: booking.subtotal_cents as number,
        currency: booking.currency as string,
      });
    } catch (e) {
      console.error("[finalize-payment] recovery credit fulfillment failed", e);
    }
  }

  return { status: targetStatus, alreadyFinalized: false };
}
