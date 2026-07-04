/** Manually run Beds24 payment confirmation for a stuck booking. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { confirmBeds24StripePayment } from "../src/lib/beds24/confirm-payment";

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

const bookingId = process.argv[2] ?? "bd9c756f-bf5a-46ff-86e0-1b06405814ea";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const result = await confirmBeds24StripePayment(admin, bookingId);
  console.log("Confirm result:", result);
  const { data } = await admin
    .from("bookings")
    .select("status, stripe_charge_id, payment_card_last4")
    .eq("id", bookingId)
    .single();
  console.log("Booking after:", data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
