/**
 * Find the latest booking for a Beds24-linked listing.
 * Usage: npx tsx scripts/find-beds24-booking.ts [listing_slug]
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFiles() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const slug = process.argv[2] ?? "leavenworth-2br";

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: listing } = await admin
  .from("listings")
  .select("id, slug, beds24_room_id, instant_book")
  .eq("slug", slug)
  .maybeSingle();

if (!listing?.beds24_room_id) {
  console.error(`Listing ${slug} not found or not linked to Beds24`);
  process.exit(1);
}

const { data: bookings } = await admin
  .from("bookings")
  .select("id, code, status, check_in, check_out, beds24_booking_id, created_at")
  .eq("listing_id", listing.id)
  .order("created_at", { ascending: false })
  .limit(5);

console.log(
    JSON.stringify(
      { listing, bookings: bookings ?? [] },
      null,
      2,
    ),
  );
}
