import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/expire-credits — flips credit_grants past their expires_at
 * to status='expired' so they're no longer redeemable. Also notifies the
 * grant owners 7 days before the expiration via in-app notifications.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");

  const admin = createSupabaseAdmin();
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: expired } = await admin
    .from("credit_grants")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", now.toISOString())
    .select("id, guest_id");

  const { data: expiringSoon } = await admin
    .from("credit_grants")
    .select("id, guest_id, remaining_cents, currency, expires_at")
    .eq("status", "active")
    .gt("remaining_cents", 0)
    .gte("expires_at", now.toISOString())
    .lt("expires_at", soon.toISOString());

  if (expiringSoon && expiringSoon.length > 0) {
    await admin.from("notifications").insert(
      expiringSoon.map((g) => ({
        recipient_id: g.guest_id,
        kind: "credit_assigned",
        title: "Your travel credit is expiring soon",
        body: `${(g.remaining_cents as number) / 100} ${g.currency} of credit expires on ${new Date(g.expires_at as string).toDateString()}.`,
        link: "/account/credits",
      })),
    );
  }

  return Response.json({
    expired_grants: (expired ?? []).length,
    expiring_soon_notified: (expiringSoon ?? []).length,
  });
}
