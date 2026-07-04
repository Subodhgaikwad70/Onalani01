/** Compare Beds24 calendar for two room IDs. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchCalendar } from "../src/lib/beds24/client";

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

const FROM = "2027-09-01";
const TO = "2027-09-20";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status, check_in, check_out, beds24_booking_id")
    .eq("listing_id", "89b89d92-e9b9-44e5-9cb9-9e3e9d2796b3")
    .in("status", ["pending_payment", "requested", "confirmed", "in_stay"]);
  console.log("Active bookings:", bookings);

  for (const room of ["660662", "667525"]) {
    const cal = await fetchCalendar(room, FROM, TO);
    console.log(`\nRoom ${room}:`, JSON.stringify(cal, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
