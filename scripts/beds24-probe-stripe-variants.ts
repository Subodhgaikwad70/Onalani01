/** Try Stripe session payload variants for a Beds24 booking. */
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
      product_data: { name: "Debug $1", description: "Stripe channel test" },
      unit_amount: 100,
    },
    quantity: 1,
  },
];

const variants = [
  { label: "bookId", body: [{ action: "stripeCreateSession", bookId, line_items: lineItems, success_url: "http://localhost:3000/ok", cancel_url: "http://localhost:3000/cancel", capture: true }] },
  { label: "bookingId", body: [{ action: "stripeCreateSession", bookingId: bookId, line_items: lineItems, success_url: "http://localhost:3000/ok", cancel_url: "http://localhost:3000/cancel", capture: true }] },
  { label: "bookId+propertyId", body: [{ action: "stripeCreateSession", bookId, propertyId: 205666, line_items: lineItems, success_url: "http://localhost:3000/ok", cancel_url: "http://localhost:3000/cancel", capture: true }] },
  { label: "bookId string", body: [{ action: "stripeCreateSession", bookId: String(bookId), line_items: lineItems, success_url: "http://localhost:3000/ok", cancel_url: "http://localhost:3000/cancel", capture: true }] },
];

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  for (const v of variants) {
    const res = await fetch(`${base}/channels/stripe`, {
      method: "POST",
      headers: { token, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(v.body),
    });
    const text = await res.text();
    console.log(`\n[${v.label}] ${res.status}:`, text.slice(0, 500));
  }
}

main().catch(console.error);
