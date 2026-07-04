import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAdminAction } from "@/lib/admin/audit";

const suspendBodySchema = z.object({
  profile_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
  ends_at: z.string().datetime().optional().nullable(),
});

export const POST = requireAdmin( async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, suspendBodySchema);
  if (error) return error;
  const admin = createSupabaseAdmin();
  const { data: row, error: insertError } = await admin
    .from("user_suspensions")
    .insert({
      profile_id: data.profile_id,
      reason: data.reason,
      ends_at: data.ends_at ?? null,
      suspended_by: session.user.id,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);

  // Soft archive their profile so the proxy can deny next request.
  await admin
    .from("profiles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", data.profile_id);

  await recordAdminAction({
    adminId: session.user.id,
    action: "user.suspend",
    targetType: "profile",
    targetId: data.profile_id,
    after: { reason: data.reason, ends_at: data.ends_at ?? null },
  });

  return Response.json({ suspension: row }, { status: 201 });
});
