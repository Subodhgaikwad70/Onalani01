/** Re-sync Beds24 invoice lines from an Onalani booking row. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resyncBeds24BookingFinancial } from "../src/lib/beds24/booking-financial";

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
  const bookingId = process.argv[2];
  if (!bookingId) {
    console.error("Usage: npx tsx scripts/resync-beds24-booking-financial.ts <booking-uuid>");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: booking, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (error || !booking) {
    console.error("Booking not found", error);
    process.exit(1);
  }

  console.log("Booking", booking.code, "beds24", booking.beds24_booking_id);
  console.log("Onalani total_cents (cash due):", booking.total_cents);
  console.log(
    "Breakdown gross:",
    (booking.pricing_breakdown as { total_cents?: number } | null)?.total_cents,
  );

  const result = await resyncBeds24BookingFinancial(admin, booking);
  console.log("Synced:", result.synced);
  if (result.financial) {
    console.log(JSON.stringify(result.financial, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
