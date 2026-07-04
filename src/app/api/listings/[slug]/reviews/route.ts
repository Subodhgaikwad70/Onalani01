import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getListingReviews } from "@/lib/reviews/listing-reviews";

type Params = { slug: string };

/** GET /api/listings/{slug}/reviews — published reviews for a listing. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { slug } = await params;
  const admin = createSupabaseAdmin();
  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (listingError) return jsonError(500, listingError.message);
  if (!listing) return jsonError(404, "Listing not found");

  try {
    const summary = await getListingReviews(listing.id);
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reviews";
    return jsonError(500, message);
  }
}
