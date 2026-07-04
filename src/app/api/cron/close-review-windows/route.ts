import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const REVIEW_WINDOW_DAYS = 14;

/**
 * GET /api/cron/close-review-windows — for any booking whose check_out is
 * older than REVIEW_WINDOW_DAYS, publish any still-unpublished reviews.
 * Reviews also publish early when both sides submit.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");

  const admin = createSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - REVIEW_WINDOW_DAYS);

  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "completed")
    .lt("check_out", cutoff.toISOString().slice(0, 10))
    .limit(500);
  const bookingIds = (bookings ?? []).map((b) => b.id as string);
  if (bookingIds.length === 0) return Response.json({ published: 0 });

  const { data: published } = await admin
    .from("reviews")
    .update({ is_published: true, published_at: new Date().toISOString() })
    .in("booking_id", bookingIds)
    .eq("is_published", false)
    .select("id");

  return Response.json({ published: (published ?? []).length });
}
