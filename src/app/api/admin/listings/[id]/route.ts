import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { updateListingBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

export const GET = requireAdmin<Params>(
  async (_req, ctx, _session) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listings")
      .select(
        "*, listing_photos(*), listing_bedrooms(*), listing_amenities(amenity_id, amenities(*)), listing_house_rules(*), listing_check_in_info(*), listing_categories(category_id, categories(*)), listing_pois(*)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonError(500, error.message);
    if (!data) return jsonError(404, "Listing not found");
    return Response.json({ listing: data });
  },
);

export const PATCH = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, updateListingBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const updates: Record<string, unknown> = { ...data };
    delete (updates as Record<string, unknown>).slug;
    delete (updates as Record<string, unknown>).property_id;

    const { data: row, error: updateError } = await supabase
      .from("listings")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) return jsonError(400, updateError.message);
    return Response.json({ listing: row });
  },
);

export const DELETE = requireAdmin<Params>(
  async (_req, ctx, _session) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("listings")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return jsonError(400, error.message);
    return Response.json({ ok: true });
  },
);
