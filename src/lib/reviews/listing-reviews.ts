import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type ListingReviewRow = {
  id: string;
  overall_rating: number;
  public_body: string | null;
  published_at: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  review_responses:
    | { body: string; created_at: string }
    | { body: string; created_at: string }[]
    | null;
};

export type ListingReviewsSummary = {
  rating_avg: number | null;
  rating_count: number;
  reviews: ListingReviewRow[];
};

function normalizeReviewResponse(
  raw: ListingReviewRow["review_responses"],
): { body: string; created_at: string } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

type ListingReviewSupabaseRow = Omit<ListingReviewRow, "profiles" | "review_responses"> & {
  profiles:
    | ListingReviewRow["profiles"]
    | NonNullable<ListingReviewRow["profiles"]>[]
    | null;
  review_responses: ListingReviewRow["review_responses"];
};

function normalizeListingReviewRow(row: ListingReviewSupabaseRow): ListingReviewRow {
  const profiles = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
  return normalizeListingReview({
    ...row,
    profiles,
  });
}

export function normalizeListingReview(row: ListingReviewRow): ListingReviewRow {
  return {
    ...row,
    review_responses: normalizeReviewResponse(row.review_responses),
  };
}

/** Published guest reviews for a listing, newest first. */
export async function getListingReviews(
  listingId: string,
  limit = 100,
): Promise<ListingReviewsSummary> {
  const admin = createSupabaseAdmin();

  const [{ data: listing }, { data: reviews, error }] = await Promise.all([
    admin
      .from("listings")
      .select("rating_avg, rating_count")
      .eq("id", listingId)
      .maybeSingle(),
    admin
      .from("reviews")
      .select(
        "id, overall_rating, public_body, published_at, profiles!reviews_author_id_fkey(display_name, avatar_url), review_responses(body, created_at)",
      )
      .eq("subject_type", "listing")
      .eq("subject_id", listingId)
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(limit),
  ]);

  if (error) throw error;

  const normalized = (reviews ?? []).map((row) =>
    normalizeListingReviewRow(row as ListingReviewSupabaseRow),
  );

  const ratingCount = listing?.rating_count ?? normalized.length;
  const ratingAvg =
    listing?.rating_avg ??
    (normalized.length > 0
      ? Math.round(
          (normalized.reduce((sum, r) => sum + r.overall_rating, 0) /
            normalized.length) *
            10,
        ) / 10
      : null);

  return {
    rating_avg: ratingAvg,
    rating_count: Math.max(ratingCount, normalized.length),
    reviews: normalized,
  };
}
