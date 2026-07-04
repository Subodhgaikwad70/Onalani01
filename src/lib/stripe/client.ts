import Stripe from "stripe";
import { isPlatformStripeSecretKeyConfigured } from "@/lib/stripe/keys";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!isPlatformStripeSecretKeyConfigured(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY is missing or still set to the placeholder in .env",
    );
  }
  _stripe = new Stripe(key, {
    // apiVersion intentionally omitted — Stripe uses the version pinned to the
    // account, which is the recommended pattern for stripe-node v22+.
    appInfo: { name: "Onalani", version: "0.1.0" },
  });
  return _stripe;
}

/**
 * Platform fee charged on each booking, expressed in basis points (1/100 of a
 * percent). E.g. PLATFORM_FEE_BPS=300 means 3.00%. Defaults to 3% if unset.
 */
export function platformFeeCents(grossCents: number): number {
  const bps = Number(process.env.PLATFORM_FEE_BPS ?? "300");
  return Math.round((grossCents * bps) / 10_000);
}
