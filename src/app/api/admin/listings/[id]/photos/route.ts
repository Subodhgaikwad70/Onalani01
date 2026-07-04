import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { setListingPhotosBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/photos — replace all photos for the listing. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, setListingPhotosBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();

    const { error: deleteError } = await supabase
      .from("listing_photos")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (data.photos.length === 0) {
      return Response.json({ photos: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("listing_photos")
      .insert(
        data.photos.map((p) => ({
          listing_id: id,
          storage_path: p.storage_path,
          url: p.url,
          caption: p.caption ?? null,
          position: p.position,
          is_cover: p.is_cover,
          width: p.width ?? null,
          height: p.height ?? null,
        })),
      )
      .select("*");

    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ photos: inserted });
  },
);
