/** Probe refund via POST /bookings actions and Stripe Connect direct. */
import { readFileSync, existsSync } from "node:fs";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";
import Stripe from "stripe";

function loadEnv() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}
loadEnv();

const bookingId = Number(process.argv[2] ?? "88494478");
const chargeId = process.argv[3] ?? "ch_3TjdABEcmuX4BHXW17lKhptO";
const stripeAccount = process.argv[4] ?? "acct_1T4TqiEcmuX4BHXW";

async function beds24Post(path: string, body: unknown) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\nPOST ${path}`, res.status, text.slice(0, 600));
}

async function main() {
  const variants = [
    [{ id: bookingId, actions: { stripeRefundCharge: { stripeChargeId: chargeId, amount: 10 } } }],
    [{ id: bookingId, actions: [{ action: "stripeRefundCharge", stripeChargeId: chargeId, amount: 10 }] }],
    [{ id: bookingId, actions: { refundStripeCharge: { stripeChargeId: chargeId, amount: 10 } } }],
    [{ bookingId, actions: { stripeRefundCharge: { stripeChargeId: chargeId, amount: 10 } } }],
  ];
  for (let i = 0; i < variants.length; i++) {
    await beds24Post("/bookings", variants[i]);
  }

  // Stripe Connect direct refund (dry-run retrieve charge first)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount });
  console.log("\nStripe charge on connect account:", {
    id: charge.id,
    amount: charge.amount,
    amount_refunded: charge.amount_refunded,
    refunded: charge.refunded,
    status: charge.status,
  });
}

main().catch(console.error);
