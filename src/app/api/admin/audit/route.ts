import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/audit?page=1&limit=50
 * Paginated admin_audit_log (newest first).
 */
export const GET = requireAdmin( async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50")),
  );
  const offset = (page - 1) * limit;

  const admin = createSupabaseAdmin();
  const { data, error, count } = await admin
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(500, error.message);

  return Response.json({
    rows: data ?? [],
    page,
    limit,
    total: count ?? null,
  });
});
