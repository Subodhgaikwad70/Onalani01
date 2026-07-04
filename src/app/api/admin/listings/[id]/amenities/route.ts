import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { setListingAmenitiesBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/amenities — replace amenity set by amenity keys. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(
      req,
      setListingAmenitiesBodySchema,
    );
    if (error) return error;

    const supabase = await createSupabaseServerClient();

    let amenityIds: string[] = [];
    if (data.amenity_keys.length > 0) {
      const { data: amenityRows, error: lookupError } = await supabase
        .from("amenities")
        .select("id, key")
        .in("key", data.amenity_keys);
      if (lookupError) return jsonError(500, lookupError.message);

      const found = new Set(amenityRows?.map((r) => r.key) ?? []);
      const missing = data.amenity_keys.filter((k) => !found.has(k));
      if (missing.length > 0) {
        return jsonError(400, `Unknown amenity keys: ${missing.join(", ")}`);
      }
      amenityIds = (amenityRows ?? []).map((r) => r.id);
    }

    const { error: deleteError } = await supabase
      .from("listing_amenities")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (amenityIds.length > 0) {
      const { error: insertError } = await supabase
        .from("listing_amenities")
        .insert(amenityIds.map((amenity_id) => ({ listing_id: id, amenity_id })));
      if (insertError) return jsonError(400, insertError.message);
    }

    return Response.json({ ok: true, count: amenityIds.length });
  },
);
