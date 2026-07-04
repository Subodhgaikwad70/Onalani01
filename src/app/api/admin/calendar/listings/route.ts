import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/admin/calendar/listings — active listings for the calendar rail. */
export const GET = requireAdmin(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, slug, unit_type, photos_url, base_price_cents, currency, min_nights, max_nights, property_id, properties!inner(property_name)",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return jsonError(500, error.message);

  const listings = (data ?? []).map((row: Record<string, unknown>) => {
    const props = row.properties as { property_name?: string | null } | null;
    return {
      id: row.id as string,
      slug: row.slug as string,
      unit_type: row.unit_type as string | null,
      photos_url: row.photos_url as string[] | null,
      base_price_cents: row.base_price_cents as number | null,
      currency: row.currency as string | null,
      min_nights: row.min_nights as number | null,
      max_nights: row.max_nights as number | null,
      property_id: row.property_id as string,
      property_name: props?.property_name ?? null,
    };
  });

  return Response.json({ listings });
});
