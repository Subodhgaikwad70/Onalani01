import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/admin/complaints?status=open */
export const GET = requireAdmin( async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("complaints")
    .select(
      "*, profiles!complaints_reporter_id_fkey(display_name, avatar_url)",
    )
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  return Response.json({ complaints: data ?? [] });
});
