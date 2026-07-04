import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const promoBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric")
    .transform((s) => s.toUpperCase()),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().min(0).max(1000000),
  max_redemptions: z.number().int().min(1).optional().nullable(),
  per_user_limit: z.number().int().min(1).default(1),
  starts_at: z.string().datetime().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  min_subtotal_cents: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const GET = requireAdmin( async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  return Response.json({ promos: data ?? [] });
});

export const POST = requireAdmin( async (req) => {
  const { data, error } = await parseJsonBody(req, promoBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("promo_codes")
    .insert(data)
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ promo: row }, { status: 201 });
});
