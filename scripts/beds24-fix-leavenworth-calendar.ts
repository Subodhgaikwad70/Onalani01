/** Move misplaced leavenworth booking from test room 667525 to Leavenworth room 660662. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cancelBeds24Booking } from "../src/lib/beds24/client";
import { invalidateRange } from "../src/lib/beds24/cache";
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
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}
loadEnv();

const LISTING_SLUG = "leavenworth-2br";
const LEAVENWORTH_ROOM_ID = "660662";
const BOOKING_ID = "d2bda214-fc6e-4ce2-a4fd-3bf277fee688";
const WRONG_BEDS24_BOOKING_ID = "88489002";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: listing } = await admin
    .from("listings")
    .select("id, slug, beds24_room_id")
    .eq("slug", LISTING_SLUG)
    .single();
  if (!listing) throw new Error("listing not found");

  if (listing.beds24_room_id !== LEAVENWORTH_ROOM_ID) {
    const { error } = await admin
      .from("listings")
      .update({ beds24_room_id: LEAVENWORTH_ROOM_ID })
      .eq("id", listing.id);
    if (error) throw error;
    console.log("Set beds24_room_id to", LEAVENWORTH_ROOM_ID);
  } else {
    console.log("Listing already on room", LEAVENWORTH_ROOM_ID);
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("check_in, check_out, beds24_booking_id")
    .eq("id", BOOKING_ID)
    .single();

  console.log("Cancelling misplaced Beds24 booking", WRONG_BEDS24_BOOKING_ID);
  await cancelBeds24Booking(WRONG_BEDS24_BOOKING_ID);

  await admin
    .from("bookings")
    .update({ beds24_booking_id: null })
    .eq("id", BOOKING_ID);

  const beds24Id = await ensureBeds24BookingSynced(admin, BOOKING_ID);
  console.log("Re-synced to Beds24 booking id:", beds24Id);

  if (booking) {
    await invalidateRange(listing.id, {
      from: booking.check_in as string,
      to: booking.check_out as string,
    });
    console.log("Invalidated calendar cache for stay window");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
