/** Find properties owned by API token owner and test Stripe on New Property. */
import { readFileSync, existsSync } from "node:fs";
import { createBeds24Booking } from "../src/lib/beds24/client";
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

async function stripeSession(bookId: number) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const body = [
    {
      action: "stripeCreateSession",
      bookId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Debug $1" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3000/ok",
      cancel_url: "http://localhost:3000/cancel",
      capture: true,
    },
  ];
  const res = await fetch(`${base}/channels/stripe`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();

  const propsRes = await fetch(`${base}/properties?id=320903`, {
    headers: { token, accept: "application/json" },
  });
  const propsBody = await propsRes.json();
  const prop = propsBody.data?.[0];
  console.log("New Property 320903 stripe config:", JSON.stringify(prop?.paymentGateways?.stripe, null, 2));
  console.log("ownerId:", prop?.account?.ownerId);

  console.log("\nCreating booking on room 667525 (New Property)…");
  const created = await createBeds24Booking({
    roomId: "667525",
    arrival: "2028-04-01",
    departure: "2028-04-02",
    numAdult: 1,
    numChild: 0,
    guestFirstName: "Stripe",
    guestLastName: "Debug",
    guestEmail: "stripe-debug@onalani.co",
    externalRef: "STRIPE-NEW-PROP",
    notes: "Stripe debug on New Property",
    status: "new",
    financial: {
      price: 1,
      tax: 0,
      invoiceItems: [{ type: "charge", description: "Debug $1", qty: 1, amount: 1 }],
    },
  });
  console.log("bookId:", created.id);

  const stripe = await stripeSession(Number(created.id));
  console.log("\nStripe session:", stripe.status, stripe.text);

  console.log("\nRetry Leavenworth booking 88490917:");
  console.log(await stripeSession(88490917));
}

main().catch(console.error);
