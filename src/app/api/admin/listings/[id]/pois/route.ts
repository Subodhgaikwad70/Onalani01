import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { setListingPoisBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/pois — replace nearby points-of-interest list. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, setListingPoisBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("listing_pois")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (data.pois.length === 0) {
      return Response.json({ pois: [] });
    }
    const { data: inserted, error: insertError } = await supabase
      .from("listing_pois")
      .insert(
        data.pois.map((p) => ({
          listing_id: id,
          name: p.name,
          kind: p.kind ?? null,
          distance_meters: p.distance_meters ?? null,
          position: p.position,
        })),
      )
      .select("*");
    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ pois: inserted });
  },
);
