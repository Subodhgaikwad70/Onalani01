import { addCalendarDay } from "@/lib/calendar/dates";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchCalendar, type Beds24CalendarDay } from "@/lib/beds24/client";

export const CACHE_TTL_SECONDS = 60; // 1 minute

export const AVAILABILITY_OVERRIDE_STATUSES = [
  "none",
  "nocheckin",
  "nocheckout",
  "nocheckinorcheckout",
] as const;

export type AvailabilityOverrideStatus =
  (typeof AVAILABILITY_OVERRIDE_STATUSES)[number];

export function isAvailabilityOverrideStatus(
  v: string,
): v is AvailabilityOverrideStatus {
  return (AVAILABILITY_OVERRIDE_STATUSES as readonly string[]).includes(v);
}

type DateRange = { from: string; to: string }; // yyyy-mm-dd inclusive .. exclusive

type AvailabilityDayRow = {
  is_available: boolean;
  min_stay: number | null;
  max_stay: number | null;
  override_status: AvailabilityOverrideStatus;
};

function* iterateDates(from: string, toExclusive: string): Generator<string> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${toExclusive}T00:00:00Z`);
  const cursor = new Date(start);
  while (cursor < end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** Map Beds24 calendar `override` string to our DB check constraint. */
function beds24OverrideToStatus(raw: unknown): AvailabilityOverrideStatus {
  if (typeof raw !== "string") return "none";
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "none" || key === "") return "none";
  if (key === "nocheckin") return "nocheckin";
  if (key === "nocheckout") return "nocheckout";
  if (key === "nocheckinorcheckout" || key === "nocheckincheckout") {
    return "nocheckinorcheckout";
  }
  return "none";
}

function parseOverrideFromDb(v: unknown): AvailabilityOverrideStatus {
  if (typeof v === "string" && isAvailabilityOverrideStatus(v)) return v;
  return "none";
}

/**
 * Reads availability_cache for the given listing/date range. Returns the rows
 * we have AND the dates that are missing or stale (older than TTL_SECONDS).
 */
async function readAvailabilityCache(listingId: string, range: DateRange) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("availability_cache")
    .select(
      "date, is_available, min_stay, max_stay, override_status, fetched_at",
    )
    .eq("listing_id", listingId)
    .gte("date", range.from)
    .lt("date", range.to);
  if (error) throw error;

  const fresh = new Map<string, AvailabilityDayRow>();
  const stale: string[] = [];
  const cutoff = Date.now() - CACHE_TTL_SECONDS * 1000;
  const seen = new Set<string>();

  for (const row of data ?? []) {
    seen.add(row.date as string);
    const fetchedAt = new Date(row.fetched_at as string).getTime();
    if (fetchedAt >= cutoff) {
      fresh.set(row.date as string, {
        is_available: row.is_available as boolean,
        min_stay: (row.min_stay as number | null) ?? null,
        max_stay: (row.max_stay as number | null) ?? null,
        override_status: parseOverrideFromDb(row.override_status),
      });
    } else {
      stale.push(row.date as string);
    }
  }

  const missing: string[] = [];
  for (const d of iterateDates(range.from, range.to)) {
    if (!seen.has(d)) missing.push(d);
  }

  return { fresh, missing, stale };
}

async function readPriceCache(listingId: string, range: DateRange) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("price_cache")
    .select("date, price_cents, currency, fetched_at")
    .eq("listing_id", listingId)
    .gte("date", range.from)
    .lt("date", range.to);
  if (error) throw error;

  const fresh = new Map<string, { price_cents: number; currency: string }>();
  const cutoff = Date.now() - CACHE_TTL_SECONDS * 1000;
  for (const row of data ?? []) {
    const fetchedAt = new Date(row.fetched_at as string).getTime();
    if (fetchedAt >= cutoff) {
      fresh.set(row.date as string, {
        price_cents: row.price_cents as number,
        currency: row.currency as string,
      });
    }
  }
  return { fresh };
}

export type ListingCacheRefreshTarget = {
  listingId: string;
  beds24RoomId: string;
  defaultCurrency: string;
};

function buildCacheRows(
  listingId: string,
  expanded: {
    availability: Map<string, AvailabilityDayRow>;
    prices: Map<string, { price_cents: number; currency: string }>;
  },
  defaultCurrency: string,
  fetchedAt: string,
) {
  const availabilityRows = Array.from(expanded.availability.entries()).map(
    ([date, v]) => ({
      listing_id: listingId,
      date,
      is_available: v.is_available,
      min_stay: v.min_stay,
      max_stay: v.max_stay,
      override_status: v.override_status,
      fetched_at: fetchedAt,
    }),
  );
  const priceRows = Array.from(expanded.prices.entries()).map(([date, v]) => ({
    listing_id: listingId,
    date,
    price_cents: v.price_cents,
    currency: v.currency || defaultCurrency,
    fetched_at: fetchedAt,
  }));
  return { availabilityRows, priceRows };
}

/**
 * Refresh availability + price for multiple listings in one Beds24 calendar
 * request, then upsert into both cache tables.
 */
export async function refreshListingsFromBeds24(
  targets: ListingCacheRefreshTarget[],
  range: DateRange,
): Promise<{ refreshed: number }> {
  if (targets.length === 0) return { refreshed: 0 };

  const calendars = await fetchCalendar(
    targets.map((t) => t.beds24RoomId),
    range.from,
    range.to,
  );

  const fetchedAt = new Date().toISOString();
  const admin = createSupabaseAdmin();
  const availabilityRows: Array<{
    listing_id: string;
    date: string;
    is_available: boolean;
    min_stay: number | null;
    max_stay: number | null;
    override_status: AvailabilityOverrideStatus;
    fetched_at: string;
  }> = [];
  const priceRows: Array<{
    listing_id: string;
    date: string;
    price_cents: number;
    currency: string;
    fetched_at: string;
  }> = [];

  for (const target of targets) {
    const days = calendars.get(target.beds24RoomId) ?? [];
    const expanded = expandBeds24Calendar(days, range);
    const rows = buildCacheRows(
      target.listingId,
      expanded,
      target.defaultCurrency,
      fetchedAt,
    );
    availabilityRows.push(...rows.availabilityRows);
    priceRows.push(...rows.priceRows);
  }

  if (availabilityRows.length > 0) {
    const { error } = await admin
      .from("availability_cache")
      .upsert(availabilityRows, { onConflict: "listing_id,date" });
    if (error) throw error;
  }
  if (priceRows.length > 0) {
    const { error } = await admin
      .from("price_cache")
      .upsert(priceRows, { onConflict: "listing_id,date" });
    if (error) throw error;
  }

  return { refreshed: targets.length };
}

/**
 * Refresh availability + price for a date range from Beds24 calendar
 * (`includeNumAvail`, `includeMinStay`, `includeMaxStay`, `includeOverride`,
 * `includePrices`), then upsert into both cache tables.
 */
async function refreshFromBeds24(
  beds24RoomId: string,
  listingId: string,
  range: DateRange,
  defaultCurrency: string,
): Promise<{
  availability: Map<string, AvailabilityDayRow>;
  prices: Map<string, { price_cents: number; currency: string }>;
}> {
  const days = await fetchCalendar(beds24RoomId, range.from, range.to);
  const expanded = expandBeds24Calendar(days, range);
  const fetchedAt = new Date().toISOString();
  const rows = buildCacheRows(listingId, expanded, defaultCurrency, fetchedAt);
  const admin = createSupabaseAdmin();

  if (rows.availabilityRows.length > 0) {
    const { error } = await admin
      .from("availability_cache")
      .upsert(rows.availabilityRows, { onConflict: "listing_id,date" });
    if (error) throw error;
  }
  if (rows.priceRows.length > 0) {
    const { error } = await admin
      .from("price_cache")
      .upsert(rows.priceRows, { onConflict: "listing_id,date" });
    if (error) throw error;
  }

  return expanded;
}

/** Beds24 returns row ranges with **inclusive** `from` and `to` (per Swagger examples). */
function expandBeds24Calendar(
  days: Beds24CalendarDay[],
  range: DateRange,
): {
  availability: Map<string, AvailabilityDayRow>;
  prices: Map<string, { price_cents: number; currency: string }>;
} {
  const availability = new Map<string, AvailabilityDayRow>();
  const prices = new Map<string, { price_cents: number; currency: string }>();
  const rangeEndInclusive = addCalendarDay(range.to, -1);

  for (const row of days) {
    const segStart = row.from > range.from ? row.from : range.from;
    const segEndInclusive = row.to < rangeEndInclusive ? row.to : rangeEndInclusive;
    if (segStart > segEndInclusive) continue;
    const segEndExclusive = addCalendarDay(segEndInclusive, 1);
    for (const d of iterateDates(segStart, segEndExclusive)) {
      availability.set(d, {
        is_available: (row.numAvail ?? 0) > 0,
        min_stay: row.minStay ?? null,
        max_stay: row.maxStay ?? null,
        override_status: beds24OverrideToStatus(row.override),
      });
      if (row.price1 != null && Number.isFinite(row.price1)) {
        prices.set(d, {
          price_cents: Math.round(row.price1 * 100),
          currency: row.currency ?? "USD",
        });
      }
    }
  }
  return { availability, prices };
}

/**
 * Public read API: returns per-day availability rows for the requested range,
 * refreshing from Beds24 on cache miss/stale. Does NOT subtract calendar_blocks
 * — that's the caller's responsibility (cheap, separate query).
 */
export async function getAvailability(
  listingId: string,
  beds24RoomId: string | null,
  range: DateRange,
  defaultCurrency: string,
): Promise<{
  available: Record<string, boolean>;
  minStay: Record<string, number | null>;
  maxStay: Record<string, number | null>;
  overrideStatus: Record<string, AvailabilityOverrideStatus>;
  pricesCents: Record<string, number>;
  currency: string;
}> {
  const cached = await readAvailabilityCache(listingId, range);
  let freshAvailability = cached.fresh;
  let freshPrices = (await readPriceCache(listingId, range)).fresh;

  const needsRefresh = cached.missing.length > 0 || cached.stale.length > 0;
  if (needsRefresh && beds24RoomId) {
    try {
      const refreshed = await refreshFromBeds24(
        beds24RoomId,
        listingId,
        range,
        defaultCurrency,
      );
      freshAvailability = new Map([...freshAvailability, ...refreshed.availability]);
      freshPrices = new Map([...freshPrices, ...refreshed.prices]);
    } catch (error) {
      // Soft fail — return whatever cache we have so the UI doesn't crash on a Beds24 outage.
      console.error("[beds24] refresh failed", error);
    }
  }

  const available: Record<string, boolean> = {};
  const minStay: Record<string, number | null> = {};
  const maxStay: Record<string, number | null> = {};
  const overrideStatus: Record<string, AvailabilityOverrideStatus> = {};
  const pricesCents: Record<string, number> = {};
  let currency = defaultCurrency;

  for (const date of iterateDates(range.from, range.to)) {
    const a = freshAvailability.get(date);
    available[date] = a ? a.is_available : true;
    minStay[date] = a?.min_stay ?? null;
    maxStay[date] = a?.max_stay ?? null;
    overrideStatus[date] = a?.override_status ?? "none";
    const p = freshPrices.get(date);
    if (p) {
      pricesCents[date] = p.price_cents;
      currency = p.currency || currency;
    }
  }

  return {
    available,
    minStay,
    maxStay,
    overrideStatus,
    pricesCents,
    currency,
  };
}

/**
 * Invalidate cache for a listing's date range — called from the Beds24 webhook
 * and after we create/cancel our own bookings via Beds24.
 */
export async function invalidateRange(listingId: string, range: DateRange) {
  const admin = createSupabaseAdmin();
  await Promise.all([
    admin
      .from("availability_cache")
      .delete()
      .eq("listing_id", listingId)
      .gte("date", range.from)
      .lt("date", range.to),
    admin
      .from("price_cache")
      .delete()
      .eq("listing_id", listingId)
      .gte("date", range.from)
      .lt("date", range.to),
  ]);
}
