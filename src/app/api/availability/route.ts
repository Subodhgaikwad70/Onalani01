import { jsonError } from "@/lib/auth/session";
import { getListingAvailabilitySlice } from "@/lib/bookings/listing-availability";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/availability?listing_slug=&from=&to=&exclude_booking_id=
 *
 * Returns availability + per-day price data for a listing in a half-open
 * range [from, to). Reads from cache; refreshes on miss/stale via Beds24.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("listing_slug");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const excludeBookingId = url.searchParams.get("exclude_booking_id");

  if (!slug || !from || !to) {
    return jsonError(400, "listing_slug, from, and to are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return jsonError(400, "from and to must be yyyy-mm-dd");
  }
  if (to <= from) {
    return jsonError(400, "to must be strictly after from");
  }

  const admin = createSupabaseAdmin();
  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (listingError) return jsonError(500, listingError.message);
  if (!listing) return jsonError(404, "Listing not found");

  const slice = await getListingAvailabilitySlice(admin, {
    listingId: listing.id,
    from,
    to,
    excludeBookingId: excludeBookingId ?? undefined,
  });

  return Response.json({
    listing_slug: slug,
    from,
    to,
    currency: slice.currency,
    available: slice.available,
    min_stay: slice.min_stay,
    max_stay: slice.max_stay,
    override_status: slice.override_status,
    prices_cents: slice.prices_cents,
  });
}
