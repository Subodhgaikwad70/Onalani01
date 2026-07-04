import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const blockBodySchema = z.object({
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(240).optional().nullable(),
});

/** GET /api/admin/listings/{id}/calendar/blocks */
export const GET = requireAdmin<Params>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("calendar_blocks")
      .select("*")
      .eq("listing_id", id)
      .order("starts_on", { ascending: true });
    if (error) return jsonError(500, error.message);
    return Response.json({ blocks: data ?? [] });
  },
);

/** POST /api/admin/listings/{id}/calendar/blocks */
export const POST = requireAdmin<Params>(
  async (req, ctx, session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, blockBodySchema);
    if (error) return error;
    if (data.ends_on < data.starts_on) {
      return jsonError(400, "ends_on must be on or after starts_on");
    }

    const supabase = await createSupabaseServerClient();
    const { data: row, error: insertError } = await supabase
      .from("calendar_blocks")
      .insert({
        listing_id: id,
        starts_on: data.starts_on,
        ends_on: data.ends_on,
        reason: data.reason ?? null,
        created_by: session.user.id,
      })
      .select("*")
      .single();
    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ block: row }, { status: 201 });
  },
);
