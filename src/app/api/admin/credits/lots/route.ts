import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const lotBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  total_cents: z.number().int().min(1),
  currency: z.string().length(3),
  expires_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export const GET = requireAdmin( async (req) => {
  const url = new URL(req.url);
  const page = boundedInt(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = boundedInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = (page - 1) * limit;
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("credit_lots")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return jsonError(500, error.message);
  return Response.json({
    credit_lots: data ?? [],
    page,
    limit,
    total: count ?? 0,
    total_pages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
  });
});

export const POST = requireAdmin( async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, lotBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("credit_lots")
    .insert({
      name: data.name,
      total_cents: data.total_cents,
      remaining_cents: data.total_cents,
      currency: data.currency,
      expires_at: data.expires_at ?? null,
      notes: data.notes ?? null,
      created_by_admin: session.user.id,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ credit_lot: row }, { status: 201 });
});
