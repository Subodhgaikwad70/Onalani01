import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

type Params = { slug: string };

/**
 * POST /api/listings/{slug}/view
 *
 * Records a single view: writes to listing_views (with a daily-rotated
 * session hash for unique counting) and upserts recently_viewed if logged in.
 *
 * No auth required — anonymous viewers count towards view_count too.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  const { slug } = await params;
  const admin = createSupabaseAdmin();

  const { data: listing, error } = await admin
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!listing) return jsonError(404, "Listing not found");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Day-bucketed session hash so the same anonymous client doesn't double-count
  // a listing on the same day. We use IP + UA as the seed.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0";
  const ua = request.headers.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const sessionHash = createHash("sha256")
    .update(`${ip}|${ua}|${day}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest("hex");

  await admin.from("listing_views").insert({
    listing_id: listing.id,
    viewer_profile_id: user?.id ?? null,
    session_hash: sessionHash,
  });

  if (user) {
    await admin.from("recently_viewed").upsert(
      {
        profile_id: user.id,
        listing_id: listing.id,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,listing_id" },
    );
  }

  return Response.json({ ok: true });
}
