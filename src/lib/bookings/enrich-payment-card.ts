import type { SupabaseClient } from "@supabase/supabase-js";
import { getBeds24StripeCharges } from "@/lib/beds24/stripe";
import { getStripe } from "@/lib/stripe/client";
import { fetchPaymentCardSummary } from "@/lib/stripe/payment-card";

const PAID_STATUSES = new Set([
  "requested",
  "confirmed",
  "in_stay",
  "completed",
  "cancelled_by_guest",
  "cancelled_by_admin",
]);

/** Backfill card last4 from Stripe when missing (e.g. older bookings). */
export async function enrichBookingPaymentCard<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  booking: T,
): Promise<T> {
  if (booking.payment_card_last4) return booking;
  if (!PAID_STATUSES.has(String(booking.status))) return booking;

  const paymentProvider = booking.payment_provider as string | undefined;
  const beds24BookingId = booking.beds24_booking_id as string | undefined;
  if (paymentProvider === "beds24_stripe" && beds24BookingId) {
    try {
      const charges = await getBeds24StripeCharges(beds24BookingId);
      const paid = charges.find((c) => {
        const s = c.status.toLowerCase();
        return s === "succeeded" || s === "paid" || s === "captured";
      });
      if (paid?.cardLast4) {
        const { error: updateError } = await admin
          .from("bookings")
          .update({
            payment_card_last4: paid.cardLast4,
            payment_card_brand: paid.cardBrand ?? null,
          })
          .eq("id", booking.id as string);
        if (updateError) {
          console.warn(
            "[enrich-payment-card] could not persist Beds24 card:",
            updateError.message,
          );
        }
        return {
          ...booking,
          payment_card_last4: paid.cardLast4,
          payment_card_brand: paid.cardBrand ?? null,
        };
      }
    } catch (e) {
      console.warn("[enrich-payment-card] Beds24 charge lookup failed", e);
    }
  }

  const paymentIntentId = booking.stripe_payment_intent_id as string | undefined;
  if (!paymentIntentId) return booking;

  try {
    const stripe = getStripe();
    const card = await fetchPaymentCardSummary(stripe, paymentIntentId);
    if (!card.last4) return booking;

    const { error: updateError } = await admin
      .from("bookings")
      .update({
        payment_card_last4: card.last4,
        payment_card_brand: card.brand,
      })
      .eq("id", booking.id as string);

    if (updateError) {
      console.warn("[enrich-payment-card] could not persist card summary:", updateError.message);
    }

    return {
      ...booking,
      payment_card_last4: card.last4,
      payment_card_brand: card.brand,
    };
  } catch (e) {
    console.warn("[enrich-payment-card] could not load card summary", e);
    return booking;
  }
}
