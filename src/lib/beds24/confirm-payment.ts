/**
 * Confirm a booking after Beds24 Stripe Checkout completes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBeds24StripeCharges, type Beds24StripeCharge } from "@/lib/beds24/stripe";
import { finalizeBookingAfterPayment } from "@/lib/bookings/finalize-after-payment";

function isSuccessfulCharge(status: string): boolean {
  const s = status.toLowerCase();
  return s === "succeeded" || s === "paid" || s === "captured";
}

function pickPaidCharge(
  charges: Beds24StripeCharge[],
): Beds24StripeCharge | undefined {
  return charges.find((c) => isSuccessfulCharge(c.status));
}

async function backfillPaymentCard(
  admin: SupabaseClient,
  bookingId: string,
  charge: Beds24StripeCharge,
): Promise<void> {
  if (!charge.cardLast4) return;
  await admin
    .from("bookings")
    .update({
      payment_card_last4: charge.cardLast4,
      payment_card_brand: charge.cardBrand ?? null,
    })
    .eq("id", bookingId);
}

async function loadPaidBeds24Charge(
  beds24BookingId: string,
): Promise<Beds24StripeCharge | null> {
  try {
    const charges = await getBeds24StripeCharges(beds24BookingId);
    return pickPaidCharge(charges) ?? null;
  } catch (e) {
    console.error("[confirm-beds24] charges lookup failed", e);
    return null;
  }
}

export async function confirmBeds24StripePayment(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{
  confirmed: boolean;
  alreadyConfirmed: boolean;
  paymentRecorded: boolean;
  status?: string;
}> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "status, payment_provider, beds24_booking_id, payment_card_last4",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Booking not found");

  if (booking.status === "confirmed" || booking.status === "in_stay") {
    if (!booking.payment_card_last4 && booking.beds24_booking_id) {
      const paid = await loadPaidBeds24Charge(booking.beds24_booking_id);
      if (paid) await backfillPaymentCard(admin, bookingId, paid);
    }
    return {
      confirmed: true,
      alreadyConfirmed: true,
      paymentRecorded: true,
      status: booking.status,
    };
  }
  if (booking.status === "requested") {
    if (!booking.payment_card_last4 && booking.beds24_booking_id) {
      const paid = await loadPaidBeds24Charge(booking.beds24_booking_id);
      if (paid) await backfillPaymentCard(admin, bookingId, paid);
    }
    return {
      confirmed: false,
      alreadyConfirmed: true,
      paymentRecorded: true,
      status: "requested",
    };
  }

  if (
    booking.payment_provider !== "beds24_stripe" ||
    !booking.beds24_booking_id
  ) {
    return { confirmed: false, alreadyConfirmed: false, paymentRecorded: false };
  }

  const paid = await loadPaidBeds24Charge(booking.beds24_booking_id);
  if (!paid) {
    return { confirmed: false, alreadyConfirmed: false, paymentRecorded: false };
  }

  const result = await finalizeBookingAfterPayment(admin, {
    bookingId,
    chargeAmountCents: paid.amount,
    currency: paid.currency,
    stripeObjectId: paid.id,
    paymentMetadata: { provider: "beds24_stripe" },
    paymentCardLast4: paid.cardLast4,
    paymentCardBrand: paid.cardBrand,
  });

  return {
    confirmed: result.status === "confirmed",
    alreadyConfirmed: result.alreadyFinalized,
    paymentRecorded: true,
    status: result.status,
  };
}
