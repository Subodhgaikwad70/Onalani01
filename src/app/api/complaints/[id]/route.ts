import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** GET /api/complaints/{id} — complaint detail for the reporter. */
export const GET = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("complaints")
    .select(
      `
      *,
      complaint_messages(
        *,
        author:profiles!complaint_messages_author_id_fkey(display_name, avatar_url)
      ),
      complaint_attachments(*)
    `,
    )
    .eq("id", id)
    .eq("reporter_id", session.user.id)
    .maybeSingle();

  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, "Complaint not found");

  return Response.json({ complaint: data });
});
