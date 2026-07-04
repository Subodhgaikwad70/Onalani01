/** Safe refund format probe — uses fake charge id (no money moves). */
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
const fakeChargeId = "ch_INVALID_PROBE_NO_REFUND";

async function post(label: string, path: string, body: unknown) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n=== ${label} ===`);
  console.log(`POST ${path} → ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

async function main() {
  const dollars = 10;

  await post("channels/stripe refundCharge (official)", "/channels/stripe", [
    {
      action: "refundCharge",
      bookingId,
      stripeChargeId: fakeChargeId,
      amount: dollars,
    },
  ]);

  await post("channels/stripe stripeRefundCharge (wrong action name)", "/channels/stripe", [
    {
      action: "stripeRefundCharge",
      bookingId,
      stripeChargeId: fakeChargeId,
      amount: dollars,
    },
  ]);

  await post("bookings actions.stripeRefundCharge (no-op)", "/bookings", [
    {
      id: bookingId,
      actions: {
        stripeRefundCharge: { stripeChargeId: fakeChargeId, amount: dollars },
      },
    },
  ]);
}

main().catch(console.error);
