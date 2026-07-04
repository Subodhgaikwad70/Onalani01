/**
 * Debug Beds24 Stripe channel: create a $1 test booking + Checkout session.
 *
 * Usage:
 *   npx tsx scripts/beds24-debug-stripe-payment.ts
 *   npx tsx scripts/beds24-debug-stripe-payment.ts --book-id 88488722
 */
import { readFileSync, existsSync } from "node:fs";
import { createBeds24Booking } from "../src/lib/beds24/client";
import {
  createBeds24StripeSession,
  getBeds24StripeCharges,
  getBeds24StripePublishableKey,
} from "../src/lib/beds24/stripe";
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

const ROOM_ID = "660662"; // Leavenworth Lw_2BR_long
const AMOUNT_CENTS = 100; // $1.00
const TEST_CODE = `STRIPE-DEBUG-${Date.now().toString(36).toUpperCase()}`;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function dumpRawStripePost(bookId: string) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const payload = [
    {
      action: "createStripeSession",
      bookingId: Number(bookId),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Beds24 Stripe debug charge",
              description: `Test $1 charge — ${TEST_CODE}`,
            },
            unit_amount: AMOUNT_CENTS,
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
    headers: {
      token,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log("\n--- Raw POST /channels/stripe ---");
  console.log("Status:", res.status);
  console.log(text);
  return text;
}

async function main() {
  let bookId = argValue("--book-id");

  console.log("Beds24 Stripe debug");
  console.log("  room:", ROOM_ID);
  console.log("  amount:", `$${(AMOUNT_CENTS / 100).toFixed(2)}`);
  console.log("  BEDS24_STRIPE_ENABLED:", process.env.BEDS24_STRIPE_ENABLED ?? "(unset)");
  console.log("  publishable key:", getBeds24StripePublishableKey().slice(0, 20) + "…");

  if (!bookId) {
    const arrival = "2028-03-01";
    const departure = "2028-03-02";
    console.log("\n1) Creating Beds24 booking", arrival, "→", departure);
    const created = await createBeds24Booking({
      roomId: ROOM_ID,
      arrival,
      departure,
      numAdult: 1,
      numChild: 0,
      guestFirstName: "Stripe",
      guestLastName: "Debug",
      guestEmail: "stripe-debug@onalani.co",
      externalRef: TEST_CODE,
      notes: `Onalani Beds24 Stripe $1 debug — ${TEST_CODE}`,
      status: "new",
      financial: {
        price: AMOUNT_CENTS / 100,
        tax: 0,
        invoiceItems: [
          {
            type: "charge",
            description: `Debug charge — ${TEST_CODE}`,
            qty: 1,
            amount: AMOUNT_CENTS / 100,
          },
        ],
      },
    });
    bookId = created.id;
    console.log("   bookId:", bookId);
  } else {
    console.log("\n1) Reusing existing bookId:", bookId);
  }

  let chargesBefore: Awaited<ReturnType<typeof getBeds24StripeCharges>> = [];
  try {
    chargesBefore = await getBeds24StripeCharges(bookId);
  } catch (e) {
    console.log("\n2) Charges before session: (lookup failed — normal for new booking)", (e as Error).message);
  }
  if (chargesBefore.length) {
    console.log("\n2) Charges before session:", chargesBefore);
  }

  await dumpRawStripePost(bookId);

  console.log("\n3) Creating session via app helper…");
  try {
    const session = await createBeds24StripeSession({
      bookId,
      lineItems: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Beds24 Stripe debug charge",
              description: `Test $1 — ${TEST_CODE}`,
            },
            unit_amount: AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      successUrl:
        "http://localhost:3000/bookings/debug/stripe-success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "http://localhost:3000/bookings/debug/stripe-cancel",
      capture: true,
    });

    console.log("   sessionId:", session.sessionId);
    console.log("   stripeAccount:", session.stripeAccount);
    console.log("   clientSecret:", session.clientSecret ?? "(none)");
    if (session.checkoutUrl) {
      console.log("   checkoutUrl:", session.checkoutUrl);
    }

    const checkoutUrl =
      session.checkoutUrl ??
      (session.sessionId.startsWith("cs_")
        ? `https://checkout.stripe.com/c/pay/${session.sessionId}`
        : null);

    console.log("\n--- Pay $1 in browser ---");
    if (checkoutUrl) {
      console.log(checkoutUrl);
    } else {
      console.log(
        "Use Stripe.js on your site:",
        `\n  Stripe('${getBeds24StripePublishableKey()}', { stripeAccount: '${session.stripeAccount}' })`,
        `\n  .redirectToCheckout({ sessionId: '${session.sessionId}' })`,
      );
    }

    console.log("\n4) After paying, list charges:");
    console.log(`   npx tsx scripts/beds24-debug-stripe-payment.ts --book-id ${bookId} --charges-only`);
  } catch (e) {
    console.error("\nSession creation FAILED:", e);
    if (e && typeof e === "object" && "body" in e) {
      console.error("Response body:", JSON.stringify((e as { body: unknown }).body, null, 2));
    }
    process.exit(1);
  }
}

async function chargesOnly() {
  const bookId = argValue("--book-id");
  if (!bookId) {
    console.error("--book-id required with --charges-only");
    process.exit(1);
  }
  const charges = await getBeds24StripeCharges(bookId);
  console.log("Charges for bookId", bookId, ":", JSON.stringify(charges, null, 2));
}

if (process.argv.includes("--charges-only")) {
  chargesOnly().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
