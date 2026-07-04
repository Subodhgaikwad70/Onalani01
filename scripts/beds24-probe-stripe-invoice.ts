/** Update booking invoice then retry Stripe session. */
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

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();

  const patch = [
    {
      id: bookId,
      price: 1,
      invoiceItems: [
        {
          type: "charge",
          description: "Debug $1 charge",
          qty: 1,
          amount: 1,
        },
      ],
    },
  ];
  const patchRes = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  console.log("PATCH booking:", patchRes.status, await patchRes.text());

  const getRes = await fetch(`${base}/bookings?id=${bookId}&includeInvoiceItems=true`, {
    headers: { token, accept: "application/json" },
  });
  console.log("\nGET booking:", await getRes.text());

  const stripeBody = [
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
  const stripeRes = await fetch(`${base}/channels/stripe`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(stripeBody),
  });
  console.log("\nStripe:", stripeRes.status, await stripeRes.text());
}

main().catch(console.error);
