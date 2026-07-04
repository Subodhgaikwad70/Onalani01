import { z } from "zod";
import { jsonError } from "@/lib/auth/session";
import { listingWithLegacyPhotoUrl } from "@/lib/listings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  guests: z.coerce.number().int().min(1).max(20).optional(),
  bbox: z.string().optional(), // "minLng,minLat,maxLng,maxLat"
  min_price: z.coerce.number().int().min(0).optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  amenities: z.string().optional(), // csv of amenity keys
  category: z.string().optional(),
  instant_book: z.coerce.boolean().optional(),
  pets: z.coerce.boolean().optional(),
  cursor: z.string().optional(), // last id from previous page
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

/**
 * GET /api/search?q=&from=&to=&guests=&bbox=&min_price=&max_price=&amenities=&category=&instant_book=&pets=&cursor=&limit=
 *
 * Listing discovery. Combines:
 *   - full-text search over listings.search_vector (q)
 *   - bounding-box filter over properties.lat/lng (bbox)
 *   - guest capacity filter (unit_occupancy >= guests)
 *   - price range against listings.base_price_cents
 *   - amenity filter via listing_amenities (intersection over keys)
 *   - category filter via listing_categories
 *   - boolean filters: instant_book, pets-allowed (via house_rules)
 *   - date range (uses availability_cache; coarse — refreshes happen lazily
 *     on listing detail). Excludes listings with any day where is_available is
 *     false or override_status is nocheckinorcheckout in the requested range.
 *
 * Returns published listings only. Cursor pagination by listings.id.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(400, "Invalid search params", parsed.error.flatten());
  }
  const params = parsed.data;

  const supabase = await createSupabaseServerClient();
  const usesPostFilters = Boolean(
    params.amenities ||
      params.category ||
      params.pets ||
      (params.from && params.to),
  );
  const queryLimit = usesPostFilters ? Math.min(params.limit * 4, 240) : params.limit;

  let query = supabase
    .from("listings")
    .select(
      "id, slug, unit_type, unit_occupancy, unit_bathrooms, unit_amenities, photos_url, roomPhotos_url, base_price_cents, currency, instant_book, view_count, rating_avg, rating_count, properties!inner(id, slug, property_name, city, state, country, latitude, longitude, status, is_active)",
    )
    .eq("is_active", true)
    .eq("properties.is_active", true)
    .eq("properties.status", "published")
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("view_count", { ascending: false })
    .order("id", { ascending: true })
    .limit(queryLimit);

  if (params.q && params.q.length >= 2) {
    query = query.textSearch("search_vector", params.q, {
      type: "websearch",
      config: "simple",
    });
  }

  if (params.guests) {
    query = query.gte("unit_occupancy", params.guests);
  }

  if (params.min_price != null) {
    query = query.gte("base_price_cents", params.min_price);
  }
  if (params.max_price != null) {
    query = query.lte("base_price_cents", params.max_price);
  }

  if (params.instant_book) {
    query = query.eq("instant_book", true);
  }

  if (params.bbox) {
    const parts = params.bbox.split(",").map((s) => Number(s));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [minLng, minLat, maxLng, maxLat] = parts;
      query = query
        .gte("properties.latitude", minLat)
        .lte("properties.latitude", maxLat)
        .gte("properties.longitude", minLng)
        .lte("properties.longitude", maxLng);
    }
  }

  if (params.cursor) {
    query = query.gt("id", params.cursor);
  }

  const { data: rows, error } = await query;
  if (error) return jsonError(500, error.message);

  let listings = rows ?? [];

  if (params.amenities) {
    const wanted = params.amenities.split(",").filter(Boolean);
    if (wanted.length > 0) {
      const { data: amenityRows } = await supabase
        .from("amenities")
        .select("id, key")
        .in("key", wanted);
      const wantedIds = new Set((amenityRows ?? []).map((r) => r.id));
      const ids = listings.map((l) => l.id);
      const { data: links } = await supabase
        .from("listing_amenities")
        .select("listing_id, amenity_id")
        .in("listing_id", ids)
        .in("amenity_id", Array.from(wantedIds));
      const counts = new Map<string, number>();
      for (const link of links ?? []) {
        counts.set(
          link.listing_id as string,
          (counts.get(link.listing_id as string) ?? 0) + 1,
        );
      }
      listings = listings.filter((l) => (counts.get(l.id) ?? 0) === wantedIds.size);
    }
  }

  if (params.category) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("key", params.category)
      .maybeSingle();
    if (cat) {
      const ids = listings.map((l) => l.id);
      const { data: links } = await supabase
        .from("listing_categories")
        .select("listing_id")
        .in("listing_id", ids)
        .eq("category_id", cat.id);
      const allowed = new Set((links ?? []).map((r) => r.listing_id as string));
      listings = listings.filter((l) => allowed.has(l.id));
    }
  }

  if (params.pets) {
    const ids = listings.map((l) => l.id);
    const { data: rules } = await supabase
      .from("listing_house_rules")
      .select("listing_id, pets_allowed")
      .in("listing_id", ids)
      .eq("pets_allowed", true);
    const allowed = new Set((rules ?? []).map((r) => r.listing_id as string));
    listings = listings.filter((l) => allowed.has(l.id));
  }

  if (params.from && params.to) {
    const ids = listings.map((l) => l.id);
    const { data: blocks } = await supabase
      .from("availability_cache")
      .select("listing_id, is_available, override_status")
      .in("listing_id", ids)
      .gte("date", params.from)
      .lt("date", params.to);
    const blocked = new Set<string>();
    for (const r of blocks ?? []) {
      if (
        r.is_available === false ||
        r.override_status === "nocheckinorcheckout"
      ) {
        blocked.add(r.listing_id as string);
      }
    }
    listings = listings.filter((l) => !blocked.has(l.id));
  }

  const page = listings.slice(0, params.limit);
  const nextCursor =
    listings.length > params.limit || (rows ?? []).length === queryLimit
      ? page[page.length - 1]?.id ?? null
      : null;

  const listingsOut = page.map((row) =>
    listingWithLegacyPhotoUrl(row as Record<string, unknown>),
  );

  return Response.json({
    listings: listingsOut,
    next_cursor: nextCursor,
    total_returned: listingsOut.length,
  });
}
