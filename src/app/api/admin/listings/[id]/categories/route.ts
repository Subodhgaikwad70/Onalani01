import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { setListingCategoriesBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/categories — replace category tags. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(
      req,
      setListingCategoriesBodySchema,
    );
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    let categoryIds: string[] = [];
    if (data.category_keys.length > 0) {
      const { data: rows, error: lookupError } = await supabase
        .from("categories")
        .select("id, key")
        .in("key", data.category_keys);
      if (lookupError) return jsonError(500, lookupError.message);
      const found = new Set(rows?.map((r) => r.key) ?? []);
      const missing = data.category_keys.filter((k) => !found.has(k));
      if (missing.length > 0) {
        return jsonError(400, `Unknown category keys: ${missing.join(", ")}`);
      }
      categoryIds = (rows ?? []).map((r) => r.id);
    }

    const { error: deleteError } = await supabase
      .from("listing_categories")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (categoryIds.length > 0) {
      const { error: insertError } = await supabase
        .from("listing_categories")
        .insert(categoryIds.map((category_id) => ({ listing_id: id, category_id })));
      if (insertError) return jsonError(400, insertError.message);
    }

    return Response.json({ ok: true, count: categoryIds.length });
  },
);
