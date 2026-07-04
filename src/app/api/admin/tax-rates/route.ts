import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const taxRateBodySchema = z.object({
  jurisdiction: z.string().trim().min(1).max(120),
  kind: z.enum(["occupancy", "vat", "city", "state", "federal", "service"]),
  rate_pct: z.number().min(0).max(100),
  applies_to: z.enum(["subtotal", "nightly", "fees", "total"]).default("subtotal"),
  is_active: z.boolean().default(true),
});

export const GET = requireAdmin( async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tax_rates")
    .select("*")
    .order("jurisdiction", { ascending: true });
  if (error) return jsonError(500, error.message);
  return Response.json({ tax_rates: data ?? [] });
});

export const POST = requireAdmin( async (req) => {
  const { data, error } = await parseJsonBody(req, taxRateBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("tax_rates")
    .insert(data)
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ tax_rate: row }, { status: 201 });
});
