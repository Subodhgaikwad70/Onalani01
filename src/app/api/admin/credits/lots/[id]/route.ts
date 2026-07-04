import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAdminAction } from "@/lib/admin/audit";

type Params = { id: string };

const SYSTEM_LOT_PREFIX = "System issuance — ";

const updateLotSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  // New funding ceiling for the lot. Must be >= the amount already issued.
  total_cents: z.number().int().min(0).optional(),
  expires_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** GET /api/admin/credits/lots/{id} — lot with issuance summary. */
export const GET = requireAdmin<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: lot, error } = await supabase
    .from("credit_lots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!lot) return jsonError(404, "Credit lot not found");

  const { count: grantCount } = await supabase
    .from("credit_grants")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", id);

  return Response.json({ credit_lot: lot, grant_count: grantCount ?? 0 });
});

/** PATCH /api/admin/credits/lots/{id} — edit metadata or top up the funding ceiling. */
export const PATCH = requireAdmin<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, updateLotSchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: before, error: fetchError } = await supabase
    .from("credit_lots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return jsonError(500, fetchError.message);
  if (!before) return jsonError(404, "Credit lot not found");

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.expires_at !== undefined) update.expires_at = data.expires_at;
  if (data.notes !== undefined) update.notes = data.notes;

  if (data.total_cents !== undefined) {
    const issued =
      (before.total_cents as number) - (before.remaining_cents as number);
    if (data.total_cents < issued) {
      return jsonError(
        400,
        `Total cannot be lower than the ${issued} cents already issued from this lot`,
      );
    }
    update.total_cents = data.total_cents;
    update.remaining_cents = data.total_cents - issued;
  }

  if (Object.keys(update).length === 0) {
    return jsonError(400, "No changes provided");
  }

  const { data: row, error: updateError } = await supabase
    .from("credit_lots")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return jsonError(400, updateError.message);

  await recordAdminAction({
    adminId: session.user.id,
    action: "credit_lot.update",
    targetType: "credit_lot",
    targetId: id,
    before,
    after: update,
  });

  return Response.json({ credit_lot: row });
});

/** DELETE /api/admin/credits/lots/{id} — only when nothing has been issued. */
export const DELETE = requireAdmin<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();

  const { data: lot, error: fetchError } = await admin
    .from("credit_lots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return jsonError(500, fetchError.message);
  if (!lot) return jsonError(404, "Credit lot not found");

  if ((lot.name as string).startsWith(SYSTEM_LOT_PREFIX)) {
    return jsonError(400, "System issuance lots cannot be deleted");
  }

  const { count } = await admin
    .from("credit_grants")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", id);
  if ((count ?? 0) > 0) {
    return jsonError(
      400,
      "Cannot delete a lot that has issued grants. Edit it instead.",
    );
  }

  const { error: deleteError } = await admin
    .from("credit_lots")
    .delete()
    .eq("id", id);
  if (deleteError) return jsonError(400, deleteError.message);

  await recordAdminAction({
    adminId: session.user.id,
    action: "credit_lot.delete",
    targetType: "credit_lot",
    targetId: id,
    before: lot,
  });

  return Response.json({ ok: true });
});
