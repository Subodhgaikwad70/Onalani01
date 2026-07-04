import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/admin/listings — all platform listings. */
export const GET = requireAdmin(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      `
      *,
      properties!inner (
        id,
        property_name,
        address,
        city,
        state,
        country,
        is_active,
        beds24_property_id,
        slug
      )
    `,
    )
    .order("updated_at", { ascending: false });

  if (error) return jsonError(500, error.message);
  return Response.json({ listings: data ?? [] });
});
