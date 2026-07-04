import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueCreditGrant, type CreditGrantSource } from "@/lib/credits/issue";
import { recordAdminAction } from "@/lib/admin/audit";

const GRANT_SOURCES = [
  "admin_grant",
  "cancellation",
  "recovery",
  "referral",
  "transfer",
  "promo",
] as const;

const bulkGrantBodySchema = z
  .object({
    guest_ids: z.array(z.string().uuid()).min(1).max(200),
    amount_cents: z.number().int().min(1),
    lot_id: z.string().uuid().optional().nullable(),
    currency: z.string().length(3).optional(),
    source: z.enum(GRANT_SOURCES).default("admin_grant"),
    expires_at: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    notify_guest: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.lot_id) || Boolean(v.currency), {
    message: "Provide either lot_id or currency",
    path: ["currency"],
  });

/** POST /api/admin/credits/grants/bulk — issue the same credit batch to many guests. */
export const POST = requireAdmin(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, bulkGrantBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const uniqueGuestIds = [...new Set(data.guest_ids)];

  let currency = data.currency?.toUpperCase();
  if (data.lot_id) {
    const { data: lot, error: lotError } = await admin
      .from("credit_lots")
      .select("id, currency, remaining_cents")
      .eq("id", data.lot_id)
      .maybeSingle();
    if (lotError) return jsonError(400, lotError.message);
    if (!lot) return jsonError(404, "Credit lot not found");
    currency = lot.currency as string;
    const needed = data.amount_cents * uniqueGuestIds.length;
    if ((lot.remaining_cents as number) < needed) {
      return jsonError(
        400,
        `Lot has insufficient funds for ${uniqueGuestIds.length} grants (${needed / 100} credits needed)`,
      );
    }
  }
  if (!currency) {
    return jsonError(400, "A currency could not be resolved for this grant");
  }

  const { data: guests, error: guestsError } = await admin
    .from("profiles")
    .select("id")
    .in("id", uniqueGuestIds);
  if (guestsError) return jsonError(500, guestsError.message);

  const foundIds = new Set((guests ?? []).map((g) => g.id as string));
  const missing = uniqueGuestIds.filter((id) => !foundIds.has(id));

  const succeeded: Array<{ guest_id: string; grant_id: string; amount_cents: number }> =
    [];
  const failed: Array<{ guest_id: string; message: string }> = [];

  for (const guestId of uniqueGuestIds) {
    if (!foundIds.has(guestId)) {
      failed.push({ guest_id: guestId, message: "Guest not found" });
      continue;
    }
    try {
      const result = await issueCreditGrant({
        guestId,
        amountCents: data.amount_cents,
        currency,
        source: data.source as CreditGrantSource,
        lotId: data.lot_id ?? undefined,
        expiresAt: data.expires_at ?? undefined,
        notes: data.notes ?? null,
        notifyGuest: data.notify_guest,
      });
      succeeded.push({
        guest_id: guestId,
        grant_id: result.grantId,
        amount_cents: result.amountCents,
      });
    } catch (e) {
      failed.push({
        guest_id: guestId,
        message: e instanceof Error ? e.message : "Failed to issue grant",
      });
    }
  }

  if (succeeded.length > 0) {
    await recordAdminAction({
      adminId: session.user.id,
      action: "credit_grant.bulk_issue",
      targetType: "credit_grant",
      targetId: succeeded[0].grant_id,
      after: {
        guest_count: succeeded.length,
        amount_cents: data.amount_cents,
        currency,
        source: data.source,
        failed_count: failed.length,
      },
    });
  }

  const status =
    succeeded.length === 0 ? 400 : failed.length > 0 ? 207 : 201;

  return Response.json(
    {
      succeeded,
      failed,
      missing_guest_ids: missing,
    },
    { status },
  );
});
