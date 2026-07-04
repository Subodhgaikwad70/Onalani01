import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { checkInInfoSchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** PUT /api/admin/listings/{id}/check-in-info — upsert the 1:1 check-in info. */
export const PUT = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, checkInInfoSchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { data: row, error: upsertError } = await supabase
      .from("listing_check_in_info")
      .upsert({ listing_id: id, ...data }, { onConflict: "listing_id" })
      .select("*")
      .single();
    if (upsertError) return jsonError(400, upsertError.message);
    return Response.json({ check_in_info: row });
  },
);
