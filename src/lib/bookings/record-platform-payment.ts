import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { cardSummaryFromPaymentIntent } from "@/lib/stripe/payment-card";

/** Persist charge + card summary from a succeeded platform PaymentIntent. */
export async function recordPlatformPaymentFromIntent(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    guestId: string;
    intent: Stripe.PaymentIntent;
  },
): Promise<{ recorded: boolean; cardLast4: string | null; cardBrand: string | null }> {
  const card = cardSummaryFromPaymentIntent(input.intent);

  const { data: existingCharge } = await admin
    .from("payment_history")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("kind", "charge")
    .maybeSingle();

  if (!existingCharge) {
    await admin.from("payment_history").insert({
      booking_id: input.bookingId,
      guest_id: input.guestId,
      kind: "charge",
      amount_cents: input.intent.amount_received,
      currency: input.intent.currency,
      stripe_object_id: input.intent.id,
      metadata: { provider: "platform" },
    });
  }

  if (card.last4) {
    await admin
      .from("bookings")
      .update({
        stripe_charge_id: input.intent.id,
        payment_card_last4: card.last4,
        payment_card_brand: card.brand,
      })
      .eq("id", input.bookingId);
  }

  return { recorded: !existingCharge, cardLast4: card.last4, cardBrand: card.brand };
}
