import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const complaintBodySchema = z.object({
  subject_type: z.enum(["listing", "host", "guest", "booking", "other"]),
  subject_id: z.string().uuid().optional().nullable(),
  category: z.enum([
    "safety",
    "fraud",
    "discrimination",
    "cleanliness",
    "misrepresentation",
    "cancellation",
    "other",
  ]),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(8000),
});

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("reporter_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  return Response.json({ complaints: data ?? [] });
});

export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, complaintBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("complaints")
    .insert({
      reporter_id: session.user.id,
      subject_type: data.subject_type,
      subject_id: data.subject_id ?? null,
      category: data.category,
      title: data.title,
      body: data.body,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ complaint: row }, { status: 201 });
});
