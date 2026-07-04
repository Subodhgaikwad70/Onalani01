import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/expire-holds — release booking_holds whose expires_at has
 * passed, AND mark pending_payment bookings older than 30 minutes as expired.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const holdsRes = await admin
    .from("booking_holds")
    .delete()
    .lt("expires_at", now)
    .select("id");

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const bookingsRes = await admin
    .from("bookings")
    .update({ status: "expired" })
    .eq("status", "pending_payment")
    .lt("created_at", cutoff)
    .select("id");

  return Response.json({
    holds_released: (holdsRes.data ?? []).length,
    pending_bookings_expired: (bookingsRes.data ?? []).length,
  });
}
