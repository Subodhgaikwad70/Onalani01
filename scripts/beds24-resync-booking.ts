/** Re-sync booking when beds24_booking_id is stale. */
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

const BOOKING_ID = process.argv[2] ?? "d2bda214-fc6e-4ce2-a4fd-3bf277fee688";
const RESET = process.argv.includes("--reset");

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: before } = await admin
    .from("bookings")
    .select("id, code, beds24_booking_id, status")
    .eq("id", BOOKING_ID)
    .single();

  console.log("Before:", before);

  if (RESET && before?.beds24_booking_id) {
    await admin
      .from("bookings")
      .update({ beds24_booking_id: null })
      .eq("id", BOOKING_ID);
    console.log("Cleared stale beds24_booking_id");
  }

  const id = await ensureBeds24BookingSynced(admin, BOOKING_ID);
  console.log("Synced beds24_booking_id:", id);

  const { data: after } = await admin
    .from("bookings")
    .select("id, code, beds24_booking_id, status")
    .eq("id", BOOKING_ID)
    .single();
  console.log("After:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
