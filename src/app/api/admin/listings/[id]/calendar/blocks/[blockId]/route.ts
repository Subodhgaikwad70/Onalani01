import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string; blockId: string };

/** DELETE /api/admin/listings/{id}/calendar/blocks/{blockId} */
export const DELETE = requireAdmin<Params>(
  async (_req, ctx) => {
    const { id, blockId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("calendar_blocks")
      .delete()
      .eq("id", blockId)
      .eq("listing_id", id);
    if (error) return jsonError(400, error.message);
    return Response.json({ ok: true });
  },
);
