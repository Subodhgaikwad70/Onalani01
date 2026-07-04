import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";

/**
 * GET /api/cron/booking-state-tick
 *
 * Daily housekeeping:
 *   - confirmed bookings whose check_in <= today  → 'in_stay'
 *   - in_stay bookings whose check_out <= today   → 'completed' + open review window
 *   - notifies guest+host when their stay completes (review reminder)
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");
  const admin = createSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: started } = await admin
    .from("bookings")
    .update({ status: "in_stay" })
    .eq("status", "confirmed")
    .lte("check_in", today)
    .gt("check_out", today)
    .select("id");

  const { data: ended } = await admin
    .from("bookings")
    .update({ status: "completed" })
    .in("status", ["in_stay", "confirmed"])
    .lte("check_out", today)
    .select("id, guest_id, admin_id, code");

  for (const b of ended ?? []) {
    await Promise.all([
      notify({
        recipientId: b.guest_id as string,
        kind: "review_window_open",
        title: "How was your stay?",
        body: `Leave a review for booking ${b.code}. You have 14 days.`,
        link: `/account/trips/${b.code}?review=1`,
      }),
      notify({
        recipientId: b.admin_id as string,
        kind: "review_window_open",
        title: "Review your guest",
        body: `You can review the guest from booking ${b.code}.`,
        link: `/admin/bookings/${b.id}/review`,
      }),
    ]);
  }

  return Response.json({
    started_in_stay: (started ?? []).length,
    completed: (ended ?? []).length,
  });
}
