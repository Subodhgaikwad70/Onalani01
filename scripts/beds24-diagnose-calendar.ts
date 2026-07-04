/** Diagnose Beds24 calendar sync for a listing. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchCalendar } from "../src/lib/beds24/client";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";
import { getAvailability, invalidateRange } from "../src/lib/beds24/cache";

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

const SLUG = process.argv[2] ?? "leavenworth-2br";
const FROM = process.argv[3] ?? "2027-09-01";
const TO = process.argv[4] ?? "2027-09-20";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: listing } = await admin
    .from("listings")
    .select("id, slug, beds24_room_id, currency, base_price_cents")
    .eq("slug", SLUG)
    .maybeSingle();
  if (!listing) throw new Error("listing not found");
  console.log("Listing:", listing);

  const { data: cacheSample } = await admin
    .from("availability_cache")
    .select("date, is_available, fetched_at")
    .eq("listing_id", listing.id)
    .gte("date", FROM)
    .lt("date", TO)
    .order("date")
    .limit(5);
  const { count: cacheCount } = await admin
    .from("availability_cache")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listing.id);

  console.log(`\navailability_cache rows (total ${cacheCount ?? 0}), sample:`, cacheSample);

  if (!listing.beds24_room_id) {
    console.log("\nNo beds24_room_id — calendar cannot sync");
    return;
  }

  try {
    const token = await getBeds24AccessToken();
    console.log("\nAuth OK, token length:", token.length);
  } catch (e) {
    console.error("\nAuth FAILED:", e);
    return;
  }

  try {
    const raw = await fetchCalendar(listing.beds24_room_id, FROM, TO);
    console.log(`\nBeds24 fetchCalendar returned ${raw.length} segment(s):`);
    console.log(JSON.stringify(raw.slice(0, 8), null, 2));
  } catch (e) {
    console.error("\nfetchCalendar FAILED:", e);
  }

  console.log("\n--- Invalidating cache and refreshing via getAvailability ---");
  await invalidateRange(listing.id, { from: FROM, to: TO });

  const result = await getAvailability(
    listing.id,
    listing.beds24_room_id,
    { from: FROM, to: TO },
    listing.currency ?? "USD",
  );

  const dates = Object.keys(result.available).sort();
  const sample = dates.slice(0, 10).map((d) => ({
    date: d,
    available: result.available[d],
    price_cents: result.pricesCents[d] ?? null,
    min_stay: result.minStay[d],
  }));
  console.log("getAvailability sample:", sample);

  const unavailable = dates.filter((d) => !result.available[d]);
  console.log(`\nUnavailable days in range: ${unavailable.length}`, unavailable.slice(0, 15));

  const base = getBeds24ApiBase();
  const token = await getBeds24AccessToken();
  const calUrl = new URL(`${base}/inventory/rooms/calendar`);
  calUrl.searchParams.set("roomId", listing.beds24_room_id);
  calUrl.searchParams.set("startDate", FROM);
  calUrl.searchParams.set("endDate", TO);
  calUrl.searchParams.set("includeNumAvail", "true");
  calUrl.searchParams.set("includePrices", "true");
  const res = await fetch(calUrl, { headers: { token, accept: "application/json" } });
  console.log("\nRaw calendar GET status:", res.status);
  const body = await res.json();
  console.log("Raw calendar count:", body.data?.[0]?.calendar?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
