import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { listingWithLegacyPhotoUrl } from "@/lib/listings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/guests/me/recently-viewed — last 24 listings the guest opened. */
export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recently_viewed")
    .select(
      "viewed_at, listings!inner(slug, unit_type, photos_url, roomPhotos_url, base_price_cents, currency, properties!inner(slug, property_name, city, state))",
    )
    .eq("profile_id", session.user.id)
    .order("viewed_at", { ascending: false })
    .limit(24);
  if (error) return jsonError(500, error.message);
  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const listing = r.listings as Record<string, unknown> | undefined;
    if (!listing) return r;
    return { ...r, listings: listingWithLegacyPhotoUrl(listing) };
  });
  return Response.json({ items });
});
