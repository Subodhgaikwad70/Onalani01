import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const setRulesBodySchema = z.object({
  rules: z
    .array(
      z.object({
        kind: z.enum([
          "weekend",
          "seasonal",
          "length_of_stay",
          "early_bird",
          "last_minute",
        ]),
        config: z.record(z.string(), z.unknown()),
        starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        priority: z.number().int().default(0),
        is_active: z.boolean().default(true),
      }),
    )
    .max(40),
});

/** GET /api/admin/listings/{id}/pricing-rules */
export const GET = requireAdmin<Params>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listing_pricing_rules")
      .select("*")
      .eq("listing_id", id)
      .order("priority", { ascending: true });
    if (error) return jsonError(500, error.message);
    return Response.json({ rules: data ?? [] });
  },
);

/** PUT /api/admin/listings/{id}/pricing-rules — replace all rules. */
export const PUT = requireAdmin<Params>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, setRulesBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("listing_pricing_rules")
      .delete()
      .eq("listing_id", id);
    if (deleteError) return jsonError(500, deleteError.message);

    if (data.rules.length === 0) return Response.json({ rules: [] });

    const { data: rows, error: insertError } = await supabase
      .from("listing_pricing_rules")
      .insert(data.rules.map((r) => ({ ...r, listing_id: id })))
      .select("*");
    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ rules: rows });
  },
);
