import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { setListingBedroomsBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/bedrooms — replace bedroom layout. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(
      req,
      setListingBedroomsBodySchema,
    );
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("listing_bedrooms")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (data.bedrooms.length === 0) {
      return Response.json({ bedrooms: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("listing_bedrooms")
      .insert(
        data.bedrooms.map((b) => ({
          listing_id: id,
          position: b.position,
          label: b.label ?? null,
          beds: b.beds,
          has_ensuite: b.has_ensuite,
        })),
      )
      .select("*");

    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ bedrooms: inserted });
  },
);
