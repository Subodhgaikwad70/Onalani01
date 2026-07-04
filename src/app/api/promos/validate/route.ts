import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const validateBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal_cents: z.number().int().min(0),
});

/**
 * POST /api/promos/validate — guest-side preview of a promo code's effect.
 * Returns the discount amount (in cents) that would be applied at booking.
 */
export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, validateBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const { data: promo } = await admin
    .from("promo_codes")
    .select("*")
    .eq("code", data.code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  if (!promo) return jsonError(404, "Promo code not found");

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    return jsonError(400, "Promo not yet active");
  }
  if (promo.expires_at && new Date(promo.expires_at) <= now) {
    return jsonError(400, "Promo has expired");
  }
  if (
    promo.max_redemptions &&
    (promo.redemption_count ?? 0) >= promo.max_redemptions
  ) {
    return jsonError(400, "Promo is fully redeemed");
  }
  if (
    promo.min_subtotal_cents != null &&
    data.subtotal_cents < promo.min_subtotal_cents
  ) {
    return jsonError(400, "Subtotal does not meet promo minimum");
  }

  const { count } = await admin
    .from("promo_redemptions")
    .select("*", { count: "exact", head: true })
    .eq("promo_id", promo.id)
    .eq("guest_id", session.user.id);
  if (count != null && count >= (promo.per_user_limit ?? 1)) {
    return jsonError(400, "Per-user limit reached");
  }

  const discountCents =
    promo.kind === "percent"
      ? Math.round(data.subtotal_cents * (Number(promo.value) / 100))
      : Math.round(Number(promo.value) * 100);

  return Response.json({
    code: promo.code,
    kind: promo.kind,
    value: Number(promo.value),
    discount_cents: discountCents,
  });
});
