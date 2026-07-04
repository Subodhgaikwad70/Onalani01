/** Probe Beds24 Stripe channel actions and GET param names. */
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

const bookId = Number(process.argv[2] ?? "88490917");

const lineItems = [
  {
    price_data: {
      currency: "usd",
      product_data: { name: "Debug $1" },
      unit_amount: 100,
    },
    quantity: 1,
  },
];

const actions = [
  "stripeCreateSession",
  "stripeCreateCheckoutSession",
  "createStripeSession",
  "stripeCheckoutSession",
];

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();

  for (const param of ["bookId", "bookingId"]) {
    for (const path of [`/channels/stripe/charges?${param}=${bookId}`, `/channels/stripe/paymentMethods?${param}=${bookId}`]) {
      const res = await fetch(`${base}${path}`, { headers: { token, accept: "application/json" } });
      console.log(`GET ${path} → ${res.status}:`, (await res.text()).slice(0, 300));
    }
  }

  for (const action of actions) {
    for (const idField of ["bookId", "bookingId"]) {
      const body = [
        {
          action,
          [idField]: bookId,
          line_items: lineItems,
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
      const text = await res.text();
      if (!text.includes("invalid bookingId") || action !== "stripeCreateSession") {
        console.log(`\nPOST action=${action} ${idField}=${bookId}:`, text.slice(0, 400));
      }
    }
  }
}

main().catch(console.error);
