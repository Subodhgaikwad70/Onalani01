import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/rollup-views — recompute listings.view_count from listing_views
 * over the last 90 days. Calls the SQL function created in Phase 5.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("rollup_listing_view_counts");
  if (error) return jsonError(500, error.message);
  return Response.json({ ok: true });
}
