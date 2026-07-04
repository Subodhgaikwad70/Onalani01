import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { appendCreditLedger } from "@/lib/credits/issue";
import { recordAdminAction } from "@/lib/admin/audit";

type Params = { id: string };

const updateGrantSchema = z.object({
  // 'revoked' clears the balance and returns it to the funding lot.
  status: z.enum(["active", "revoked"]).optional(),
  expires_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

/** GET /api/admin/credits/grants/{id} — grant detail with ledger history. */
export const GET = requireAdmin<Params>(async (req, ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const ledgerLimit = boundedInt(url.searchParams.get("ledger_limit"), 50, 100);
  const supabase = await createSupabaseServerClient();

  const { data: grant, error } = await supabase
    .from("credit_grants")
    .select(
      "*, credit_lots(id, name), profiles!credit_grants_guest_id_fkey(id, display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!grant) return jsonError(404, "Credit grant not found");

  const { data: ledger } = await supabase
    .from("credit_ledger")
    .select("*")
    .eq("grant_id", id)
    .order("created_at", { ascending: false })
    .limit(ledgerLimit);

  return Response.json({ credit_grant: grant, ledger: ledger ?? [] });
});

/** PATCH /api/admin/credits/grants/{id} — adjust expiry/notes or revoke the batch. */
export const PATCH = requireAdmin<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, updateGrantSchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const { data: before, error: fetchError } = await admin
    .from("credit_grants")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return jsonError(500, fetchError.message);
  if (!before) return jsonError(404, "Credit grant not found");

  const wantsRevoke =
    data.status === "revoked" && (before.status as string) !== "revoked";

  if (wantsRevoke) {
    const remaining = before.remaining_cents as number;

    if (remaining > 0) {
      const { data: lot } = await admin
        .from("credit_lots")
        .select("id, remaining_cents")
        .eq("id", before.lot_id as string)
        .maybeSingle();
      if (lot) {
        await admin
          .from("credit_lots")
          .update({
            remaining_cents: (lot.remaining_cents as number) + remaining,
          })
          .eq("id", lot.id);
      }

      await appendCreditLedger({
        guestId: before.guest_id as string,
        grantId: id,
        kind: "expired",
        amountCents: -remaining,
        currency: before.currency as string,
        description: "Credit batch revoked by admin",
        metadata: { revoked_by: session.user.id },
      });
    }

    const { data: row, error: revokeError } = await admin
      .from("credit_grants")
      .update({ status: "revoked", remaining_cents: 0 })
      .eq("id", id)
      .select("*")
      .single();
    if (revokeError) return jsonError(400, revokeError.message);

    await recordAdminAction({
      adminId: session.user.id,
      action: "credit_grant.revoke",
      targetType: "credit_grant",
      targetId: id,
      before,
      after: { status: "revoked", returned_cents: remaining },
    });

    return Response.json({ credit_grant: row });
  }

  const update: Record<string, unknown> = {};
  if (data.expires_at !== undefined) update.expires_at = data.expires_at;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.status === "active" && (before.status as string) === "revoked") {
    return jsonError(400, "Revoked grants cannot be reactivated");
  }

  if (Object.keys(update).length === 0) {
    return jsonError(400, "No changes provided");
  }

  const { data: row, error: updateError } = await admin
    .from("credit_grants")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return jsonError(400, updateError.message);

  await recordAdminAction({
    adminId: session.user.id,
    action: "credit_grant.update",
    targetType: "credit_grant",
    targetId: id,
    before,
    after: update,
  });

  return Response.json({ credit_grant: row });
});
