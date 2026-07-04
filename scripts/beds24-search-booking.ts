/** Quick Beds24 booking search for verification. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";

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

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: booking } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id, slug)")
    .eq("id", BOOKING_ID)
    .maybeSingle();
  if (!booking) throw new Error("booking not found");

  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();

  const roomId = (booking.listings as { beds24_room_id: string }).beds24_room_id;
  const queries = [
    `id=${booking.beds24_booking_id}`,
    `id=${booking.beds24_booking_id}&status=request`,
    `roomId=${roomId}&arrival=${booking.check_in}&departure=${booking.check_out}`,
    `searchString=${booking.code}`,
    `modifiedFrom=2026-06-18T00:00:00`,
  ];

  for (const q of queries) {
    console.log(`\n=== GET /bookings?${q} ===`);
    const res = await fetch(`${base}/bookings?${q}`, {
      headers: { token, accept: "application/json" },
    });
    const text = await res.text();
    console.log(text.slice(0, 800));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
