import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { jsonError, setProfileRole, type UserRole } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAdminAction } from "@/lib/admin/audit";

const patchUserSchema = z.object({
  role: z.enum(["guest", "admin", "super_admin"]),
});

type RouteParams = { id: string };

/**
 * PATCH /api/admin/users/[id] — change a user's role (super_admin only).
 */
export const PATCH = requireRole<RouteParams>(
  ["super_admin"],
  async (req, ctx, session) => {
    const { id } = await ctx.params;
    if (id === session.user.id) {
      return jsonError(400, "You cannot change your own role");
    }

    const { data, error } = await parseJsonBody(req, patchUserSchema);
    if (error) return error;

    const admin = createSupabaseAdmin();
    const { data: before, error: lookupError } = await admin
      .from("profiles")
      .select("id, display_name, role, archived_at")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) return jsonError(500, lookupError.message);
    if (!before) return jsonError(404, "User not found");
    if (before.archived_at) {
      return jsonError(400, "Cannot change role of a suspended user");
    }
    if (before.role === data.role) {
      return Response.json({ profile: before });
    }

    try {
      await setProfileRole(id, data.role as UserRole);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Role update failed";
      return jsonError(400, message);
    }

    const { data: profile, error: fetchError } = await admin
      .from("profiles")
      .select("id, display_name, role, avatar_url, archived_at, created_at")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) return jsonError(500, fetchError.message);

    await recordAdminAction({
      adminId: session.user.id,
      action: "user.role_change",
      targetType: "profile",
      targetId: id,
      before: { role: before.role },
      after: { role: data.role },
    });

    return Response.json({ profile });
  },
);
