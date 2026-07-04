/** Probe Beds24 Stripe refund action variants (dry-run style). */
import { readFileSync, existsSync } from "node:fs";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";

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
const amountCents = Number(process.argv[4] ?? "1000");

const actions = [
  "stripeRefundCharge",
  "refundStripeCharge",
  "refundStripe",
  "stripeRefund",
  "refundCharge",
  "chargeRefund",
  "createStripeRefund",
  "refundStripePayment",
  "stripeChargeRefund",
  "refund",
];

async function post(label: string, body: unknown) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}/channels/stripe`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n[${label}] ${res.status}:`, text.slice(0, 800));
}

async function main() {
  for (const action of actions) {
    await post(action, [
      {
        action,
        bookingId,
        stripeChargeId: chargeId,
        amount: amountCents / 100,
      },
    ]);
  }
  // nested actions wrapper (Beds24 booking POST style)
  await post("actions wrapper", [
    {
      bookingId,
      actions: [
        {
          action: "stripeRefundCharge",
          stripeChargeId: chargeId,
          amount: amountCents / 100,
        },
      ],
    },
  ]);
  await post("actions refundStripeCharge", [
    {
      bookingId,
      actions: [
        {
          action: "refundStripeCharge",
          stripeChargeId: chargeId,
          amount: amountCents / 100,
        },
      ],
    },
  ]);
  // POST to /channels/stripe/charges
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}/channels/stripe/charges`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify([
      {
        action: "refundStripeCharge",
        bookingId,
        stripeChargeId: chargeId,
        amount: amountCents / 100,
      },
    ]),
  });
  await post("chargeId field", [
    {
      action: "refundStripeCharge",
      bookingId,
      chargeId,
      amount: amountCents / 100,
    },
  ]);
  await post("stripeChargeId cents", [
    {
      action: "refundStripeCharge",
      bookingId,
      stripeChargeId: chargeId,
      amount: amountCents,
    },
  ]);
  await post("no amount full refund", [
    {
      action: "refundStripeCharge",
      bookingId,
      stripeChargeId: chargeId,
    },
  ]);
}

main().catch(console.error);
