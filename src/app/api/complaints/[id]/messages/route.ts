import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const messageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

/** POST /api/complaints/{id}/messages — add a public reply to a complaint. */
export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, messageBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: complaint, error: complaintError } = await supabase
    .from("complaints")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (complaintError) return jsonError(500, complaintError.message);
  if (!complaint) return jsonError(404, "Complaint not found");

  const { data: message, error: insertError } = await supabase
    .from("complaint_messages")
    .insert({
      complaint_id: id,
      author_id: session.user.id,
      body: data.body,
      is_internal: false,
    })
    .select(
      `
      *,
      author:profiles!complaint_messages_author_id_fkey(display_name, avatar_url)
    `,
    )
    .single();

  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ message }, { status: 201 });
});
