import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import {
  getBeds24StripePublishableKey,
  resolveBeds24HostedCheckoutUrl,
} from "@/lib/beds24/stripe";
import type { CheckoutCredentials } from "@/lib/bookings/checkout-session";

/** Pending change approved but awaiting guest payment before dates apply. */
export async function loadSupplementalChangeCheckout(
  admin: SupabaseClient,
  bookingId: string,
): Promise<
  (CheckoutCredentials & {
    change_request_id: string;
    proposed_change: {
      check_in: string;
      check_out: string;
      adults: number;
      children: number;
      infants: number;
      pets: number;
      pricing_breakdown: unknown;
    };
  }) | null
> {
  const { data: changeRequest } = await admin
    .from("booking_change_requests")
    .select(
      "id, currency, total_cents, check_in, check_out, adults, children, infants, pets, pricing_breakdown",
    )
    .eq("booking_id", bookingId)
    .eq("status", "approved_pending_payment")
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!changeRequest) return null;

  const { data: pendingRow } = await admin
    .from("payment_history")
    .select("amount_cents")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .contains("metadata", { status: "pending", supplemental: true })
    .maybeSingle();
  if (!pendingRow) return null;

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "status, currency, payment_provider, stripe_payment_intent_id, beds24_stripe_session_id, beds24_stripe_checkout_url, stripe_connect_account_id",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const amountCents = Number(pendingRow.amount_cents);
  const base = {
    total_cents: amountCents,
    currency: booking.currency as string,
    booking_status: booking.status as string,
    change_request_id: changeRequest.id as string,
    checkout_kind: "change_request_supplemental" as const,
    proposed_change: {
      check_in: changeRequest.check_in as string,
      check_out: changeRequest.check_out as string,
      adults: Number(changeRequest.adults ?? 1),
      children: Number(changeRequest.children ?? 0),
      infants: Number(changeRequest.infants ?? 0),
      pets: Number(changeRequest.pets ?? 0),
      pricing_breakdown: changeRequest.pricing_breakdown,
    },
  };

  if (booking.payment_provider === "beds24_stripe") {
    const checkoutUrl = resolveBeds24HostedCheckoutUrl(
      booking.beds24_stripe_checkout_url as string | null,
    );
    if (booking.beds24_stripe_session_id && checkoutUrl) {
      return {
        ...base,
        payment_mode: "beds24_stripe",
        checkout_session_id: booking.beds24_stripe_session_id as string,
        checkout_url: checkoutUrl,
        stripe_connect_account_id: (booking.stripe_connect_account_id as string) ?? null,
        stripe_publishable_key: getBeds24StripePublishableKey(),
      };
    }
    return null;
  }

  const stripePaymentIntentId = booking.stripe_payment_intent_id as string | null;
  if (!stripePaymentIntentId) return null;

  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (
      intent.metadata?.kind === "change_request_supplemental" &&
      intent.status !== "canceled" &&
      intent.status !== "succeeded"
    ) {
      return {
        ...base,
        payment_mode: "platform",
        client_secret: intent.client_secret,
      };
    }
  } catch {
    return null;
  }

  return null;
}
