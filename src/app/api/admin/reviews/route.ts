import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const LIST_SELECT = `
  id,
  overall_rating,
  public_body,
  is_published,
  published_at,
  created_at,
  subject_type,
  booking_id,
  author:profiles!reviews_author_id_fkey(display_name),
  bookings(
    code,
    check_in,
    check_out,
    listings(
      slug,
      unit_type,
      properties(property_name)
    )
  ),
  review_responses(body)
`;

/** GET /api/admin/reviews — all guest listing reviews with optional filters. */
export const GET = requireAdmin(async (req) => {
  const url = new URL(req.url);
  const subjectType = url.searchParams.get("subject_type") ?? "listing";
  const published = url.searchParams.get("published");
  const q = url.searchParams.get("q")?.trim().toLowerCase();

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("reviews")
    .select(LIST_SELECT)
    .eq("subject_type", subjectType)
    .order("created_at", { ascending: false })
    .limit(200);

  if (published === "true") query = query.eq("is_published", true);
  if (published === "false") query = query.eq("is_published", false);

  const { data, error } = await query;
  if (error) return jsonError(500, error.message);

  let rows = data ?? [];
  if (q) {
    rows = rows.filter((row) => {
      const author = (row.author as { display_name?: string | null } | null)?.display_name ?? "";
      const body = row.public_body ?? "";
      const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
      const listing = booking?.listings
        ? Array.isArray(booking.listings)
          ? booking.listings[0]
          : booking.listings
        : null;
      const listingLabel = [
        listing?.properties?.property_name,
        listing?.unit_type,
        listing?.slug,
        booking?.code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        author.toLowerCase().includes(q) ||
        body.toLowerCase().includes(q) ||
        listingLabel.includes(q)
      );
    });
  }

  return Response.json({ reviews: rows });
});
