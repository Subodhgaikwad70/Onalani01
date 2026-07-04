import type { User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ADMIN_ROLES,
  isAdminRole,
  type UserRole,
} from "@/lib/auth/roles";

export type { UserRole };
export { ADMIN_ROLES, isAdminRole };

/** Reads role from the JWT app_metadata claim. */
export function readRoleFromUser(user: User | null | undefined): UserRole {
  if (!user) return "guest";
  const claim = user.app_metadata?.role;
  if (
    claim === "admin" ||
    claim === "super_admin" ||
    claim === "guest"
  ) {
    return claim;
  }
  return "guest";
}

export type SessionContext = {
  user: User;
  role: UserRole;
};

/** Returns the current user + role, or null if unauthenticated. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const claimRole = readRoleFromUser(user);
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const profileRole = profile?.role;
  const role =
    profileRole === "admin" ||
    profileRole === "super_admin" ||
    profileRole === "guest"
      ? profileRole
      : claimRole;
  return { user, role };
}

/**
 * Mutates a profile's role and mirrors it into auth.users.app_metadata so that
 * subsequent JWTs carry the new role claim. Service-role only.
 */
export async function setProfileRole(profileId: string, role: UserRole) {
  const admin = createSupabaseAdmin();

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", profileId);
  if (profileError) throw profileError;

  const { error: userError } = await admin.auth.admin.updateUserById(profileId, {
    app_metadata: { role },
  });
  if (userError) throw userError;
}

/** Standard JSON error helper for API route handlers. */
export function jsonError(status: number, message: string, details?: unknown) {
  return Response.json(
    { error: { message, details: details ?? null } },
    { status },
  );
}
