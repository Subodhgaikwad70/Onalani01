/** Create $1 Stripe session with correct Beds24 action name. */
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

const bookingId = Number(process.argv[2] ?? "88490917");

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const body = [
    {
      action: "createStripeSession",
      bookingId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Beds24 Stripe debug", description: "$1 test charge" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3000/bookings/debug/stripe-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/bookings/debug/stripe-cancel",
      capture: true,
    },
  ];
  const res = await fetch(`${base}/channels/stripe`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("Status:", res.status);
  const parsed = JSON.parse(text);
  console.log(JSON.stringify(parsed, null, 2));

  const session = parsed[0]?.new?.stripeSession ?? parsed[0]?.new;
  if (session?.id) {
    console.log("\nCheckout URL: https://checkout.stripe.com/c/pay/" + session.id);
    console.log("stripe_account:", session.stripe_account ?? "(check response)");
  }
}

main().catch(console.error);
