import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { houseRulesSchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/house-rules — upsert the 1:1 house-rules row. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, houseRulesSchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { data: row, error: upsertError } = await supabase
      .from("listing_house_rules")
      .upsert({ listing_id: id, ...data }, { onConflict: "listing_id" })
      .select("*")
      .single();
    if (upsertError) return jsonError(400, upsertError.message);
    return Response.json({ house_rules: row });
  },
);
