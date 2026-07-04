/** Simulate pay-intent for a pending leavenworth booking. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ensureBookingCheckoutSession } from "../src/lib/bookings/checkout-session";

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

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: listing } = await admin
    .from("listings")
    .select("id, slug, beds24_room_id")
    .eq("slug", "leavenworth-2br")
    .single();
  console.log("Listing:", listing);

  const { data: booking } = await admin
    .from("bookings")
    .select("id, code, status, payment_provider, stripe_payment_intent_id, beds24_stripe_session_id")
    .eq("listing_id", listing!.id)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking) {
    console.log("No pending_payment booking — create one via the site to test.");
    return;
  }
  console.log("Before:", booking);

  const creds = await ensureBookingCheckoutSession(admin, booking.id);
  console.log("\nCheckout credentials:", creds);

  const { data: after } = await admin
    .from("bookings")
    .select("payment_provider, stripe_payment_intent_id, beds24_booking_id, beds24_stripe_session_id, stripe_connect_account_id")
    .eq("id", booking.id)
    .single();
  console.log("\nAfter DB:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
