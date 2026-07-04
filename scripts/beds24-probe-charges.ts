/** Probe Beds24 Stripe charges for a booking. */
import { readFileSync, existsSync } from "node:fs";
import { getBeds24StripeCharges } from "../src/lib/beds24/stripe";
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

const bookId = process.argv[2] ?? "88494478";

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}/channels/stripe/charges?bookingId=${bookId}`, {
    headers: { token, accept: "application/json" },
  });
  console.log("Raw GET status:", res.status);
  const raw = await res.text();
  console.log("Raw body:", raw);

  const parsed = await getBeds24StripeCharges(bookId);
  console.log("\nParsed charges:", JSON.stringify(parsed, null, 2));
}

main().catch(console.error);
