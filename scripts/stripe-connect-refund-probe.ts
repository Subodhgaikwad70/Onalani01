/** Diagnose Stripe Connect refund path (read-only retrieve, optional --try-refund). */
import { readFileSync, existsSync } from "node:fs";
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

const chargeId = process.argv[2] ?? "ch_3TjdABEcmuX4BHXW17lKhptO";
const stripeAccount = process.argv[3] ?? "acct_1T4TqiEcmuX4BHXW";
const tryRefund = process.argv.includes("--try-refund");

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  console.log("STRIPE_SECRET_KEY mode:", key.startsWith("sk_live") ? "live" : key.startsWith("sk_test") ? "test" : "unknown");

  const stripe = new Stripe(key);
  try {
    const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount });
    console.log("Connect charge:", {
      id: charge.id,
      livemode: charge.livemode,
      amount: charge.amount,
      amount_refunded: charge.amount_refunded,
      refunded: charge.refunded,
      status: charge.status,
      payment_intent: charge.payment_intent,
    });
  } catch (e) {
    console.error("Connect charge retrieve failed:", (e as Error).message);
  }

  try {
    const platformCharge = await stripe.charges.retrieve(chargeId);
    console.log("Platform charge:", {
      id: platformCharge.id,
      livemode: platformCharge.livemode,
    });
  } catch (e) {
    console.error("Platform charge retrieve failed:", (e as Error).message);
  }

  if (tryRefund) {
    const refund = await stripe.refunds.create(
      { charge: chargeId, amount: 1000 },
      { stripeAccount },
    );
    console.log("Refund created:", refund.id, refund.status);
  }
}

main().catch(console.error);
