/** Point leavenworth-2br at the Leavenworth Beds24 room (660662) and re-sync a booking. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ensureBeds24BookingSynced } from "../src/lib/beds24/sync-booking";

function loadEnv() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

const LISTING_SLUG = "leavenworth-2br";
const BEDS24_ROOM_ID = "660662";
const BOOKING_ID = "d2bda214-fc6e-4ce2-a4fd-3bf277fee688";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: listing, error: listingErr } = await admin
    .from("listings")
    .update({ beds24_room_id: BEDS24_ROOM_ID })
    .eq("slug", LISTING_SLUG)
    .select("id, slug, beds24_room_id")
    .single();
  if (listingErr) throw listingErr;
  console.log("Updated listing:", listing);

  await admin
    .from("bookings")
    .update({ beds24_booking_id: null })
    .eq("id", BOOKING_ID);

  const beds24Id = await ensureBeds24BookingSynced(admin, BOOKING_ID);
  console.log("Synced booking to Beds24 id:", beds24Id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
