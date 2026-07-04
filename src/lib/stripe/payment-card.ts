import type Stripe from "stripe";

export type PaymentCardSummary = {
  last4: string | null;
  brand: string | null;
};

export function formatPaymentCardLabel(
  last4: string | null | undefined,
  brand: string | null | undefined,
): string | null {
  if (!last4) return null;
  const label = brand
    ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
    : "Card";
  return `${label} ···· ${last4}`;
}

export function cardSummaryFromPaymentIntent(
  intent: Stripe.PaymentIntent,
): PaymentCardSummary {
  const pm = intent.payment_method;
  if (pm && typeof pm === "object" && pm.type === "card" && pm.card) {
    return { last4: pm.card.last4 ?? null, brand: pm.card.brand ?? null };
  }

  const charge = intent.latest_charge;
  if (charge && typeof charge === "object") {
    const card = charge.payment_method_details?.card;
    if (card) {
      return { last4: card.last4 ?? null, brand: card.brand ?? null };
    }
  }

  return { last4: null, brand: null };
}

export async function fetchPaymentCardSummary(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<PaymentCardSummary> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["payment_method", "latest_charge.payment_method_details"],
  });
  return cardSummaryFromPaymentIntent(intent);
}
