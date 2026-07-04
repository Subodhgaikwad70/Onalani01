import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const setFeesBodySchema = z.object({
  fees: z
    .array(
      z.object({
        kind: z.enum(["cleaning", "extra_guest", "pet", "service", "resort"]),
        amount_cents: z.number().int().min(0),
        currency: z.string().length(3),
        applies_per: z.enum(["stay", "night", "guest_night"]).default("stay"),
        threshold: z.number().int().min(0).optional().nullable(),
      }),
    )
    .max(20),
});

/** GET /api/admin/listings/{id}/fees */
export const GET = requireAdmin<Params>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listing_fees")
      .select("*")
      .eq("listing_id", id)
      .order("kind", { ascending: true });
    if (error) return jsonError(500, error.message);
    return Response.json({ fees: data ?? [] });
  },
);

/** PUT /api/admin/listings/{id}/fees — replace all fees for the listing. */
export const PUT = requireAdmin<Params>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, setFeesBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("listing_fees")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (data.fees.length === 0) return Response.json({ fees: [] });

    const { data: rows, error: insertError } = await supabase
      .from("listing_fees")
      .insert(data.fees.map((f) => ({ ...f, listing_id: id })))
      .select("*");
    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ fees: rows });
  },
);
