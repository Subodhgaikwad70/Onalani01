/**
 * Compare an Onalani booking with its Beds24 reservation.
 * Usage: npx tsx scripts/debug-beds24-booking.ts [bookingId]
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getBeds24AccessToken, isBeds24Configured } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";
import { buildBeds24FinancialPayload } from "../src/lib/beds24/booking-financial";
import { ensureBeds24BookingSynced } from "../src/lib/beds24/sync-booking";

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

const args = process.argv.slice(2);
const PATCH = args.includes("--patch");
const BOOKING_ID =
  args.find((a) => !a.startsWith("--")) ??
  "d2bda214-fc6e-4ce2-a4fd-3bf277fee688";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = getBeds24ApiBase();

  if (!url || !key) throw new Error("Missing Supabase env");
  if (!isBeds24Configured()) {
    throw new Error("Missing BEDS24_REFRESH_TOKEN (or legacy BEDS24_API_TOKEN)");
  }

  const token = await getBeds24AccessToken();

  try {
    const detailsRes = await fetch(`${base}/authentication/details`, {
      headers: { token, accept: "application/json" },
    });
    const details = await detailsRes.json();
    console.log("=== BEDS24 TOKEN (GET /authentication/details) ===");
    console.log(JSON.stringify(details, null, 2));
  } catch (e) {
    console.warn("Could not fetch Beds24 token details", e);
  }

  const admin = createClient(url, key);
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "*, listings!inner(id, slug, beds24_room_id, unit_type, properties(property_name))",
    )
    .eq("id", BOOKING_ID)
    .maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error(`Booking ${BOOKING_ID} not found`);

  if (PATCH) {
    console.log(`Patching Beds24 sync for ${BOOKING_ID}...`);
    await ensureBeds24BookingSynced(admin, BOOKING_ID);
    const { data: refreshed } = await admin
      .from("bookings")
      .select(
        "*, listings!inner(id, slug, beds24_room_id, unit_type, properties(property_name))",
      )
      .eq("id", BOOKING_ID)
      .maybeSingle();
    if (refreshed) Object.assign(booking, refreshed);
  }

  const listing = booking.listings as {
    slug?: string;
    beds24_room_id?: string | null;
  };

  const [{ data: profile }, { data: authData }] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name")
      .eq("id", booking.guest_id)
      .maybeSingle(),
    admin.auth.admin.getUserById(booking.guest_id),
  ]);

  const displayName = profile?.display_name ?? "Guest";
  const nameParts = displayName.trim().split(/\s+/);
  const expectedFirst = nameParts[0] ?? "Guest";
  const expectedLast = nameParts.slice(1).join(" ") || "Guest";
  const expectedEmail = authData.user?.email ?? "guest@onalani.com";
  const expectedBeds24Status = booking.is_instant_book ? "confirmed" : "request";

  console.log("=== ONALANI BOOKING ===");
  console.log(
    JSON.stringify(
      {
        id: booking.id,
        code: booking.code,
        status: booking.status,
        is_instant_book: booking.is_instant_book,
        check_in: booking.check_in,
        check_out: booking.check_out,
        adults: booking.adults,
        children: booking.children,
        total_cents: booking.total_cents,
        currency: booking.currency,
        beds24_booking_id: booking.beds24_booking_id,
        payment_provider: booking.payment_provider,
        guest_display_name: displayName,
        guest_email: expectedEmail,
        listing_slug: listing.slug,
        beds24_room_id: listing.beds24_room_id,
      },
      null,
      2,
    ),
  );

  let beds24Row: Record<string, unknown> | null = null;

  if (booking.beds24_booking_id) {
    const getUrl = new URL(`${base}/bookings`);
    getUrl.searchParams.set("id", String(booking.beds24_booking_id));
    getUrl.searchParams.set("includeInvoiceItems", "true");
    const res = await fetch(getUrl, {
      headers: { token, accept: "application/json" },
    });
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    beds24Row = body.data?.[0] ?? null;
    console.log("\n=== BEDS24 BOOKING (by id) ===");
    console.log(JSON.stringify(body, null, 2));
  } else if (listing.beds24_room_id) {
    console.log("\n=== BEDS24: no beds24_booking_id on booking — searching stay ===");
    const searchUrl = new URL(`${base}/bookings`);
    searchUrl.searchParams.set("roomId", listing.beds24_room_id);
    searchUrl.searchParams.set("arrival", booking.check_in);
    searchUrl.searchParams.set("departure", booking.check_out);
    const res = await fetch(searchUrl, {
      headers: { token, accept: "application/json" },
    });
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    console.log(JSON.stringify(body, null, 2));
    beds24Row =
      body.data?.find((r) => r.custom1 === booking.code) ??
      body.data?.[0] ??
      null;
  } else {
    console.log("\n=== LISTING NOT LINKED TO BEDS24 ===");
    return;
  }

  if (!beds24Row) {
    console.log("\n=== NO BEDS24 RECORD FOUND ===");
    return;
  }

  const checks: Array<[string, unknown, unknown]> = [
    ["roomId", String(beds24Row.roomId), String(listing.beds24_room_id)],
    ["arrival", beds24Row.arrival, booking.check_in],
    ["departure", beds24Row.departure, booking.check_out],
    ["numAdult", String(beds24Row.numAdult), String(booking.adults)],
    ["numChild", String(beds24Row.numChild), String(booking.children)],
    ["guestFirstName", beds24Row.firstName, expectedFirst],
    ["guestLastName", beds24Row.lastName, expectedLast],
    ["guestEmail", beds24Row.email, expectedEmail],
    ["custom1 (booking code)", beds24Row.custom1, booking.code],
    ["status", beds24Row.status, expectedBeds24Status],
    ["refererEditable", beds24Row.refererEditable, "Onalani"],
  ];

  const expectedFinancial = buildBeds24FinancialPayload(booking);
  if (expectedFinancial) {
    checks.push([
      "price",
      Number(beds24Row.price),
      expectedFinancial.price,
    ]);
    checks.push(["tax", Number(beds24Row.tax), expectedFinancial.tax]);
  }

  console.log("\n=== FIELD COMPARISON ===");
  let pass = 0;
  let fail = 0;
  for (const [field, actual, expected] of checks) {
    const ok = actual === expected;
    if (ok) pass++;
    else fail++;
    console.log(
      `${ok ? "OK  " : "FAIL"} ${field}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
    );
  }

  if (beds24Row.notes) {
    console.log(`\nnotes: ${String(beds24Row.notes)}`);
  }

  if (beds24Row.invoiceItems) {
    console.log(`\ninvoiceItems: ${JSON.stringify(beds24Row.invoiceItems, null, 2)}`);
  }

  if (expectedFinancial) {
    console.log(
      `\nexpected financial payload: ${JSON.stringify(expectedFinancial, null, 2)}`,
    );
  }

  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
