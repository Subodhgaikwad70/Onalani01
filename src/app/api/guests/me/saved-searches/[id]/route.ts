import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

export const DELETE = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("profile_id", session.user.id);
  if (error) return jsonError(400, error.message);
  return Response.json({ ok: true });
});
