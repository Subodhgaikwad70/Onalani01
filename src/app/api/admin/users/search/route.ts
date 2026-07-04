import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/users/search?q=
 * Search profiles by display_name (partial) or exact profile id (uuid).
 */
export const GET = requireAdmin( async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return jsonError(400, "Query must be at least 2 characters");
  }

  const admin = createSupabaseAdmin();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let query = admin
    .from("profiles")
    .select("id, display_name, role, archived_at, created_at")
    .limit(25);

  if (uuidRe.test(q)) {
    query = query.eq("id", q);
  } else {
    query = query.ilike("display_name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, error.message);

  return Response.json({ users: data ?? [] });
});
