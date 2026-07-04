import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const categoryBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores"),
  label: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(120).optional().nullable(),
  sort_order: z.number().int().default(0),
});

export const GET = requireAdmin( async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) return jsonError(500, error.message);
  return Response.json({ categories: data ?? [] });
});

export const POST = requireAdmin( async (req) => {
  const { data, error } = await parseJsonBody(req, categoryBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("categories")
    .insert(data)
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ category: row }, { status: 201 });
});

