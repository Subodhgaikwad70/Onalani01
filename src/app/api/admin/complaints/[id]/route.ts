import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAdminAction } from "@/lib/admin/audit";

type Params = { id: string };

const updateBodySchema = z.object({
  status: z
    .enum(["open", "investigating", "resolved", "closed"])
    .optional(),
  assigned_admin_id: z.string().uuid().optional().nullable(),
  resolution_summary: z.string().max(8000).optional().nullable(),
});

/** GET /api/admin/complaints/{id} */
export const GET = requireAdmin<Params>(async (_req, ctx) => {
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
      complaint_attachments(*),
      profiles!complaints_reporter_id_fkey(display_name, avatar_url)
    `,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, "Complaint not found");
  return Response.json({ complaint: data });
});

/** PATCH /api/admin/complaints/{id} — assign / resolve / close. */
export const PATCH = requireAdmin<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, updateBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from("complaints")
    .select("status, assigned_admin_id, resolution_summary")
    .eq("id", id)
    .maybeSingle();
  const { data: row, error: updateError } = await supabase
    .from("complaints")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return jsonError(400, updateError.message);
  await recordAdminAction({
    adminId: session.user.id,
    action: "complaint.update",
    targetType: "complaint",
    targetId: id,
    before,
    after: data,
  });
  return Response.json({ complaint: row });
});
