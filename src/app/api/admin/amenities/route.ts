import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { z } from "zod";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const amenityBodySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores"),
  label: z.string().min(1).max(120),
  icon: z.string().max(120).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
});

export const GET = requireAdmin( async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("amenities")
    .select("*")
    .order("category", { ascending: true })
    .order("label", { ascending: true });
  if (error) return jsonError(500, error.message);
  return Response.json({ amenities: data ?? [] });
});

export const POST = requireAdmin( async (req) => {
  const { data, error } = await parseJsonBody(req, amenityBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("amenities")
    .insert(data)
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ amenity: row }, { status: 201 });
});
