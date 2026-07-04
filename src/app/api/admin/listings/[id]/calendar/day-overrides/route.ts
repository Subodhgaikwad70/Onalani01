import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const bodySchema = z.object({
  selection: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(400),
  patch: z.object({
    price_cents: z.number().int().min(0).nullable().optional(),
    min_stay: z.number().int().min(1).nullable().optional(),
    check_in_allowed: z.boolean().optional(),
    check_out_allowed: z.boolean().optional(),
  }),
  /** When true, deletes host calendar rows for all dates in selection. */
  clear: z.boolean().optional(),
});

function isRedundantRow(row: {
  price_cents: number | null;
  min_stay: number | null;
  check_in_allowed: boolean;
  check_out_allowed: boolean;
}) {
  return (
    row.price_cents == null &&
    row.min_stay == null &&
    row.check_in_allowed &&
    row.check_out_allowed
  );
}

/** PATCH /api/admin/listings/{id}/calendar/day-overrides */
export const PATCH = requireAdmin<Params>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const { data: body, error } = await parseJsonBody(req, bodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();

    if (body.clear) {
      const { error: delError } = await supabase
        .from("listing_calendar_day_overrides")
        .delete()
        .eq("listing_id", id)
        .in("date", body.selection);
      if (delError) return jsonError(400, delError.message);
      return Response.json({ ok: true });
    }

    const { data: existingRows, error: fetchError } = await supabase
      .from("listing_calendar_day_overrides")
      .select("*")
      .eq("listing_id", id)
      .in("date", body.selection);
    if (fetchError) return jsonError(500, fetchError.message);

    const existingByDate = new Map(
      (existingRows ?? []).map((r) => [r.date as string, r]),
    );

    const toUpsert: Record<string, unknown>[] = [];
    const toDelete: string[] = [];

    for (const date of body.selection) {
      const cur = existingByDate.get(date);
      const merged = {
        listing_id: id,
        date,
        price_cents:
          body.patch.price_cents !== undefined
            ? body.patch.price_cents
            : ((cur?.price_cents as number | null) ?? null),
        min_stay:
          body.patch.min_stay !== undefined
            ? body.patch.min_stay
            : ((cur?.min_stay as number | null) ?? null),
        check_in_allowed:
          body.patch.check_in_allowed !== undefined
            ? body.patch.check_in_allowed
            : ((cur?.check_in_allowed as boolean) ?? true),
        check_out_allowed:
          body.patch.check_out_allowed !== undefined
            ? body.patch.check_out_allowed
            : ((cur?.check_out_allowed as boolean) ?? true),
      };

      if (isRedundantRow(merged)) {
        if (cur) toDelete.push(date);
      } else {
        toUpsert.push(merged);
      }
    }

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("listing_calendar_day_overrides")
        .delete()
        .eq("listing_id", id)
        .in("date", toDelete);
      if (delErr) return jsonError(400, delErr.message);
    }

    if (toUpsert.length > 0) {
      const { error: upErr } = await supabase
        .from("listing_calendar_day_overrides")
        .upsert(toUpsert, { onConflict: "listing_id,date" });
      if (upErr) return jsonError(400, upErr.message);
    }

    return Response.json({ ok: true });
  },
);
