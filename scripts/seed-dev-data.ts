/**
 * Dev-only seed: demo users, catalog, bookings, messaging, credits, promos, complaints.
 *
 * Prerequisites:
 *   - Migrations applied (`supabase db push` or SQL Editor).
 *   - `.env` or `.env.local` with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run:
 *   npm run seed:dev
 *
 * Safe to run multiple times: skips catalog/bookings if demo property slug exists.
 * Demo logins (password always the same):
 *   guest@onalani.co / TestPass12345!
 *   admin@onalani.co / TestPass12345!
 *   superadmin@onalani.co / TestPass12345!
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const DEMO_PROPERTY_SLUG = "demo-lagoon-resort";
const DEMO_LISTING_SLUGS = ["demo-ocean-suite", "demo-garden-studio"] as const;
const DEMO_PASSWORD = "TestPass12345!";

function loadEnvFiles() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;  
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

type DemoRole = "guest" | "admin" | "super_admin";

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  displayName: string,
  role: DemoRole,
): Promise<string> {
  let id = await findUserIdByEmail(admin, email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { role },
    });
    if (error) throw error;
    id = data.user!.id;
    console.log(`Created auth user ${email} (${role})`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { role },
    });
    if (error) throw error;
    console.log(`Updated auth user ${email} (${role})`);
  }

  const { error: pe } = await admin
    .from("profiles")
    .update({ display_name: displayName, role })
    .eq("id", id);
  if (pe) throw pe;

  return id;
}

async function chunkUpsert<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  table: string,
  rows: T[],
  chunkSize = 80,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await admin.from(table).upsert(chunk as never);
    if (error) throw error;
  }
}

async function main() {
  loadEnvFiles();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Ensuring demo auth users + profile roles…");
  const guestId = await ensureAuthUser(
    admin,
    "guest@onalani.co",
    "Demo Guest",
    "guest",
  );
  const adminId = await ensureAuthUser(
    admin,
    "admin@onalani.co",
    "Demo Admin",
    "admin",
  );
  const superAdminId = await ensureAuthUser(
    admin,
    "superadmin@onalani.co",
    "Demo Super Admin",
    "super_admin",
  );
  void superAdminId;

  const { data: existingProp } = await admin
    .from("properties")
    .select("id")
    .eq("slug", DEMO_PROPERTY_SLUG)
    .maybeSingle();

  if (existingProp?.id) {
    console.log(
      `\nDemo property "${DEMO_PROPERTY_SLUG}" already exists — skipping catalog + transactional seed.`,
    );
    console.log("\nLog in with guest@onalani.co / admin@onalani.co / superadmin@onalani.co");
    console.log(`Password: ${DEMO_PASSWORD}`);
    return;
  }

  const { data: flexPolicy } = await admin
    .from("cancellation_policies")
    .select("id, key, label, rules")
    .eq("key", "super_strict")
    .maybeSingle();
  if (!flexPolicy?.id) {
    throw new Error("cancellation_policies.super_strict missing — run migrations first");
  }

  const photoResort =
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&q=80";
  const photoOcean =
    "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200&q=80";
  const photoGarden =
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200&q=80";

  const { data: propRow, error: propInsErr } = await admin
    .from("properties")
    .insert({
      slug: DEMO_PROPERTY_SLUG,
      property_name: "Demo Lagoon Resort",
      description:
        "Seed property for local testing — ocean views, garden bungalows, and sample bookings.",
      photos_url: [photoResort],
      list_of_amenities: ["wifi", "pool", "parking", "beach_access"],
      address: "1 Demo Shore Road",
      city: "Demo Harbor",
      state: "DH",
      country: "United States",
      postal_code: "00001",
      latitude: 21.3069,
      longitude: -157.8583,
      max_guests: 8,
      is_active: true,
      timezone: "Pacific/Honolulu",
      cancellation_policy_id: flexPolicy.id,
      status: "published",
      instant_book: true,
    })
    .select("id")
    .single();
  if (propInsErr) throw propInsErr;

  const propertyId = propRow!.id as string;

  const amenitySpecs = [
    { key: "wifi", label: "Wi‑Fi", category: "essentials" },
    { key: "pool", label: "Pool", category: "facilities" },
    { key: "parking", label: "Free parking", category: "facilities" },
    { key: "kitchen", label: "Kitchen", category: "essentials" },
    { key: "pets", label: "Pets allowed", category: "policies" },
  ];
  const { error: amErr } = await admin.from("amenities").upsert(
    amenitySpecs.map((a) => ({
      key: a.key,
      label: a.label,
      category: a.category,
    })),
    { onConflict: "key", ignoreDuplicates: false },
  );
  if (amErr) throw amErr;

  const { data: amenityRows } = await admin.from("amenities").select("id, key");
  const amenityIdByKey = new Map(
    (amenityRows ?? []).map((r) => [r.key as string, r.id as string]),
  );

  const catSpecs = [
    { key: "beachfront", label: "Beachfront", sort_order: 1 },
    { key: "cabins", label: "Cabins", sort_order: 2 },
  ];
  await admin.from("categories").upsert(catSpecs, {
    onConflict: "key",
    ignoreDuplicates: false,
  });
  const { data: catRows } = await admin.from("categories").select("id, key");
  const catIdByKey = new Map((catRows ?? []).map((r) => [r.key as string, r.id as string]));

  let taxId: string;
  const { data: existingTax } = await admin
    .from("tax_rates")
    .select("id")
    .eq("jurisdiction", "Demo Harbor Occupancy")
    .maybeSingle();
  if (existingTax?.id) {
    taxId = existingTax.id as string;
  } else {
    const { data: taxRow, error: taxErr } = await admin
      .from("tax_rates")
      .insert({
        jurisdiction: "Demo Harbor Occupancy",
        kind: "occupancy",
        rate_pct: 10.5,
        applies_to: "subtotal",
        is_active: true,
      })
      .select("id")
      .single();
    if (taxErr) throw taxErr;
    taxId = taxRow!.id as string;
  }

  const { error: ptrErr } = await admin.from("property_tax_rates").insert({
    property_id: propertyId,
    tax_rate_id: taxId,
  });
  if (ptrErr) throw ptrErr;

  const listingsPayload = [
    {
      slug: DEMO_LISTING_SLUGS[0],
      property_id: propertyId,
      unit_type: "Ocean-view suite",
      unit_description: "Two-bedroom suite with lanai. Instant book enabled for testing checkout.",
      unit_occupancy: 4,
      unit_bathrooms: 2,
      photos_url: [photoOcean],
      base_price_cents: 18500,
      currency: "USD",
      min_nights: 2,
      max_nights: 14,
      instant_book: true,
      is_active: true,
      beds24_room_id: null as string | null,
    },
    {
      slug: DEMO_LISTING_SLUGS[1],
      property_id: propertyId,
      unit_type: "Garden studio",
      unit_description: "Quiet studio surrounded by palms. Pets allowed.",
      unit_occupancy: 2,
      unit_bathrooms: 1,
      photos_url: [photoGarden],
      base_price_cents: 9500,
      currency: "USD",
      min_nights: 1,
      max_nights: 21,
      instant_book: true,
      is_active: true,
      beds24_room_id: null as string | null,
    },
  ];

  const { data: listingRows, error: listErr } = await admin
    .from("listings")
    .insert(listingsPayload)
    .select("id, slug, base_price_cents, currency, photos_url");
  if (listErr) throw listErr;

  const listingBySlug = new Map(
    (listingRows ?? []).map((r) => [r.slug as string, r]),
  );

  for (const slug of DEMO_LISTING_SLUGS) {
    const row = listingBySlug.get(slug);
    if (!row) continue;
    const lid = row.id as string;

    await admin.from("listing_house_rules").upsert({
      listing_id: lid,
      pets_allowed: slug === DEMO_LISTING_SLUGS[1],
      smoking_allowed: false,
      parties_allowed: false,
      children_allowed: true,
    });

    await admin.from("listing_check_in_info").upsert({
      listing_id: lid,
      check_in_from: "15:00",
      check_out_by: "11:00",
      self_check_in: true,
      check_in_method: "smartlock",
      instructions_md: "Use code **4242** on the smart lock for this demo listing.",
    });

    await admin.from("listing_fees").insert({
      listing_id: lid,
      kind: "cleaning",
      amount_cents: 7500,
      currency: row.currency as string,
      applies_per: "stay",
    });

    const wantAmenities =
      slug === DEMO_LISTING_SLUGS[0]
        ? ["wifi", "pool", "parking", "kitchen"]
        : ["wifi", "kitchen", "pets"];
    for (const key of wantAmenities) {
      const aid = amenityIdByKey.get(key);
      if (aid)
        await admin.from("listing_amenities").insert({
          listing_id: lid,
          amenity_id: aid,
        });
    }

    const catKey = slug === DEMO_LISTING_SLUGS[0] ? "beachfront" : "cabins";
    const cid = catIdByKey.get(catKey);
    if (cid)
      await admin.from("listing_categories").insert({
        listing_id: lid,
        category_id: cid,
      });

    await admin.from("listing_photos").insert({
      listing_id: lid,
      storage_path: `demo/${lid}/cover.jpg`,
      url: Array.isArray(row.photos_url)
        ? ((row.photos_url[0] as string | undefined) ?? photoResort)
        : photoResort,
      position: 0,
      is_cover: true,
    });
  }

  const today = new Date();
  const from = isoDate(today);
  const to = isoDate(addDays(today, 400));
  const availRows: Record<string, unknown>[] = [];
  const priceRows: Record<string, unknown>[] = [];
  const fetchedAt = new Date().toISOString();

  for (const slug of DEMO_LISTING_SLUGS) {
    const row = listingBySlug.get(slug);
    if (!row) continue;
    const lid = row.id as string;
    const price = row.base_price_cents as number;
    const cur = row.currency as string;
    for (let d = new Date(`${from}T00:00:00Z`); d < new Date(`${to}T00:00:00Z`); ) {
      const ds = isoDate(d);
      availRows.push({
        listing_id: lid,
        date: ds,
        is_available: true,
        min_stay: 1,
        max_stay: null as number | null,
        override_status: "none",
        fetched_at: fetchedAt,
      });
      priceRows.push({
        listing_id: lid,
        date: ds,
        price_cents: price,
        currency: cur,
        fetched_at: fetchedAt,
      });
      d = addDays(d, 1);
    }
  }

  console.log("Upserting availability + price cache (may take a few seconds)…");
  await chunkUpsert(admin, "availability_cache", availRows);
  await chunkUpsert(admin, "price_cache", priceRows);

  const snapshotPolicy = flexPolicy;
  const minimalBreakdown = {
    currency: "USD",
    nights: 3,
    subtotal_cents: 55500,
    taxes_total_cents: 5000,
    fees: [] as unknown[],
    nightly_lines: [] as unknown[],
    total_cents: 60500,
    seed: true,
  };

  const upcomingIn = addDays(today, 45);
  const upcomingOut = addDays(today, 48);
  const pastIn = addDays(today, -90);
  const pastOut = addDays(today, -87);

  const ocean = listingBySlug.get(DEMO_LISTING_SLUGS[0])!;
  const garden = listingBySlug.get(DEMO_LISTING_SLUGS[1])!;

  const { data: bookingUp, error: b1e } = await admin
    .from("bookings")
    .insert({
      guest_id: guestId,
      listing_id: ocean.id,
      property_id: propertyId,
      check_in: isoDate(upcomingIn),
      check_out: isoDate(upcomingOut),
      adults: 2,
      children: 0,
      status: "confirmed",
      is_instant_book: true,
      subtotal_cents: 55500,
      cleaning_fee_cents: 7500,
      extra_guest_fee_cents: 0,
      service_fee_cents: 5000,
      taxes_cents: 5000,
      credit_applied_cents: 0,
      promo_discount_cents: 0,
      total_cents: 60500,
      currency: "USD",
      pricing_breakdown: minimalBreakdown,
      cancellation_policy_snapshot: snapshotPolicy,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (b1e) throw b1e;

  const { data: bookingPast, error: b2e } = await admin
    .from("bookings")
    .insert({
      guest_id: guestId,
      listing_id: garden.id,
      property_id: propertyId,
      check_in: isoDate(pastIn),
      check_out: isoDate(pastOut),
      adults: 2,
      status: "completed",
      is_instant_book: true,
      subtotal_cents: 28500,
      cleaning_fee_cents: 7500,
      extra_guest_fee_cents: 0,
      service_fee_cents: 3000,
      taxes_cents: 2000,
      credit_applied_cents: 0,
      promo_discount_cents: 0,
      total_cents: 39000,
      currency: "USD",
      pricing_breakdown: { ...minimalBreakdown, nights: 3, subtotal_cents: 28500 },
      cancellation_policy_snapshot: snapshotPolicy,
      confirmed_at: isoDate(pastIn),
    })
    .select("id")
    .single();
  if (b2e) throw b2e;

  const { data: reviewRow, error: revErr } = await admin
    .from("reviews")
    .insert({
      booking_id: bookingPast!.id,
      author_id: guestId,
      subject_type: "listing",
      subject_id: garden.id,
      overall_rating: 5,
      public_body: "Wonderful demo stay — garden studio felt peaceful and clean.",
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (revErr) throw revErr;

  await admin.from("review_criteria_scores").insert([
    { review_id: reviewRow!.id, criterion: "cleanliness", score: 5 },
    { review_id: reviewRow!.id, criterion: "accuracy", score: 5 },
    { review_id: reviewRow!.id, criterion: "communication", score: 5 },
    { review_id: reviewRow!.id, criterion: "location", score: 5 },
    { review_id: reviewRow!.id, criterion: "check_in", score: 5 },
    { review_id: reviewRow!.id, criterion: "value", score: 5 },
  ]);

  await admin.from("promo_codes").upsert(
    {
      code: "DEMO10",
      kind: "percent",
      value: 10,
      per_user_limit: 3,
      is_active: true,
    },
    { onConflict: "code", ignoreDuplicates: false },
  );

  const { data: lotRow, error: lotErr } = await admin
    .from("credit_lots")
    .insert({
      name: "Demo marketing credit",
      total_cents: 500_000,
      remaining_cents: 450_000,
      currency: "USD",
      expires_at: addDays(today, 365).toISOString(),
      created_by_admin: adminId,
      notes: "Created by scripts/seed-dev-data.ts",
    })
    .select("id")
    .single();
  if (lotErr) throw lotErr;

  await admin.from("credit_grants").insert({
    lot_id: lotRow!.id,
    guest_id: guestId,
    original_cents: 50_000,
    remaining_cents: 50_000,
    currency: "USD",
    expires_at: addDays(today, 180).toISOString(),
    status: "active",
  });

  const { data: wishRow } = await admin
    .from("wishlists")
    .insert({
      guest_id: guestId,
      name: "Dream trips (demo)",
      is_public: false,
    })
    .select("id")
    .single();

  if (wishRow)
    await admin.from("wishlist_items").insert({
      wishlist_id: wishRow.id,
      listing_id: ocean.id,
      notes: "Book after payday",
    });

  await admin.from("saved_searches").insert({
    profile_id: guestId,
    name: "Beachfront Demo",
    query: { q: "ocean", min_price: 10000 },
    alerts_enabled: false,
  });

  const { data: convRow, error: convErr } = await admin
    .from("conversations")
    .insert({
      guest_id: guestId,
      admin_id: adminId,
      listing_id: ocean.id,
      booking_id: bookingUp!.id,
      subject: `Booking question (${ocean.slug})`,
      last_message_at: new Date().toISOString(),
      last_message_preview: "Hi! What time is checkout?",
      guest_unread_count: 0,
      admin_unread_count: 1,
    })
    .select("id")
    .single();
  if (convErr) throw convErr;

  await admin.from("messages").insert([
    {
      conversation_id: convRow!.id,
      sender_id: guestId,
      body: "Hi! What time is checkout?",
      is_system: false,
    },
    {
      conversation_id: convRow!.id,
      sender_id: adminId,
      body: "Checkout is 11am — happy to arrange late checkout if the calendar allows.",
      is_system: false,
    },
  ]);

  await admin.from("notifications").insert([
    {
      recipient_id: guestId,
      kind: "booking_confirmed",
      title: "Booking confirmed",
      body: "Your stay at Demo Lagoon Resort is confirmed.",
      link: `/account/trips/${bookingUp!.id}`,
      payload: { booking_id: bookingUp!.id },
    },
    {
      recipient_id: guestId,
      kind: "message_received",
      title: "New message from support",
      body: "Checkout is 11am — happy to arrange late checkout if the calendar allows.",
      link: `/account/messages/${convRow!.id}`,
      payload: { conversation_id: convRow!.id },
    },
    {
      recipient_id: guestId,
      kind: "credit_assigned",
      title: "Travel credits added to your account",
      body: "50 USD credits (expires in 90 days).",
      link: "/account/credits",
    },
  ]);

  await admin.from("saved_searches").insert({
    profile_id: guestId,
    name: "Lagoon getaway",
    query: {
      location: "Demo Lagoon Resort",
      checkin: "2026-06-12",
      checkout: "2026-06-18",
      adults: "2",
    },
    alerts_enabled: true,
  });

  await admin.from("complaints").insert({
    reporter_id: guestId,
    subject_type: "listing",
    subject_id: ocean.id,
    category: "cleanliness",
    title: "Demo complaint — please ignore",
    body: "This is seeded test data for the admin complaints workflow.",
    status: "open",
  });

  console.log("\nSeed complete.");
  console.log(`Property slug: ${DEMO_PROPERTY_SLUG}`);
  console.log(`Listing slugs: ${DEMO_LISTING_SLUGS.join(", ")}`);
  console.log("\nLog in:");
  console.log("  guest@onalani.co / admin@onalani.co / superadmin@onalani.co");
  console.log(`  Password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
