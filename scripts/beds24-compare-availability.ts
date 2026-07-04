/** Compare Onalani merged availability vs raw Beds24 calendar. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchCalendar } from "../src/lib/beds24/client";
import { getAvailability } from "../src/lib/beds24/cache";

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
const LISTING_ID = "89b89d92-e9b9-44e5-9cb9-9e3e9d2796b3";
const ROOM = "660662";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const avail = await getAvailability(LISTING_ID, ROOM, { from: FROM, to: TO }, "USD");
  const raw = await fetchCalendar(ROOM, FROM, TO);

  const numAvailByDate = new Map<string, number>();
  for (const row of raw) {
    for (
      let d = row.from;
      d <= row.to;
      d = new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === row.to
        ? row.to
        : (() => {
            const x = new Date(`${d}T00:00:00Z`);
            x.setUTCDate(x.getUTCDate() + 1);
            return x.toISOString().slice(0, 10);
          })()
    ) {
      if (d >= FROM && d < TO) numAvailByDate.set(d, row.numAvail ?? 0);
      if (d === row.to) break;
    }
  }
  // simpler expansion
  const beds24Avail = new Map<string, boolean>();
  for (const row of raw) {
    let cur = row.from;
    while (cur <= row.to) {
      if (cur >= FROM && cur < TO) {
        beds24Avail.set(cur, (row.numAvail ?? 0) > 0);
      }
      if (cur === row.to) break;
      const n = new Date(`${cur}T00:00:00Z`);
      n.setUTCDate(n.getUTCDate() + 1);
      cur = n.toISOString().slice(0, 10);
    }
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("code, status, check_in, check_out, beds24_booking_id")
    .eq("listing_id", LISTING_ID)
    .in("status", ["pending_payment", "requested", "confirmed", "in_stay"])
    .lt("check_in", TO)
    .gt("check_out", FROM);

  console.log("Bookings in range:", bookings);
  console.log("\nDate       | Beds24 | Cache | After local bookings | Price");
  const { shouldSubtractLocalBooking } = await import(
    "../src/lib/bookings/local-availability"
  );
  const stalePendingCutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  for (let d = FROM; d < TO; ) {
    const b = beds24Avail.get(d);
    let o = avail.available[d];
    const p = avail.pricesCents[d];
    for (const booking of bookings ?? []) {
      if (
        !shouldSubtractLocalBooking(booking, true, stalePendingCutoffIso)
      ) {
        continue;
      }
      const start = booking.check_in as string;
      const end = booking.check_out as string;
      if (d >= start && d < end) o = false;
    }
    if (b !== o) {
      console.log(`${d} | ${b} | ${avail.available[d]} | ${o} | ${p ?? "—"}  <-- MISMATCH`);
    }
    const n = new Date(`${d}T00:00:00Z`);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n.toISOString().slice(0, 10);
  }
}

main().catch(console.error);
