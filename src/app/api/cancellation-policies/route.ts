import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CANCELLATION_POLICY_DISPLAY,
  DEFAULT_CANCELLATION_POLICY_KEY,
} from "@/lib/bookings/cancellation-policies";

/** GET /api/cancellation-policies — active Onalani cancellation tiers. */
export async function GET() {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("cancellation_policies")
    .select("id, key, label, rules")
    .eq("is_active", true)
    .in("key", ["firm", "super_strict", "non_refundable"])
    .order("key");

  if (error) return jsonError(500, error.message);

  const policies = (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    rules: row.rules,
    display:
      CANCELLATION_POLICY_DISPLAY[
        row.key as keyof typeof CANCELLATION_POLICY_DISPLAY
      ] ?? null,
  }));

  return Response.json({
    policies,
    default_key: DEFAULT_CANCELLATION_POLICY_KEY,
  });
}
