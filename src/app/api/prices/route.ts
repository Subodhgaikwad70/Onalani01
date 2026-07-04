import { jsonError } from "@/lib/auth/session";
import { getAvailability } from "@/lib/beds24/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/prices?listing_slug=&from=&to=
 *
 * Returns the per-day price map for the requested range using the same
 * cache layer as /api/availability. This is a convenience endpoint for
 * the listing detail page when only prices are needed (e.g. calendar dots).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("listing_slug");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!slug || !from || !to) {
    return jsonError(400, "listing_slug, from, and to are required");
  }

  const admin = createSupabaseAdmin();
  const { data: listing, error } = await admin
    .from("listings")
    .select("id, beds24_room_id, currency, base_price_cents")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!listing) return jsonError(404, "Listing not found");

  const result = await getAvailability(
    listing.id,
    listing.beds24_room_id,
    { from, to },
    listing.currency ?? "USD",
  );

  // Fall back to base price for any day Beds24 didn't return a price for.
  const filled: Record<string, number> = {};
  for (const date of Object.keys(result.available)) {
    filled[date] = result.pricesCents[date] ?? listing.base_price_cents;
  }

  return Response.json({
    listing_slug: slug,
    from,
    to,
    currency: result.currency,
    prices_cents: filled,
  });
}
