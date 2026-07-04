import type { User } from "@supabase/supabase-js";

export type UserRole = "guest" | "admin" | "super_admin";

export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

/** True when the role has staff (admin portal) access. */
export function isAdminRole(role: UserRole | string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** Pure role read from JWT app_metadata (safe for client bundles). */
export function readRoleFromJwt(user: User | null | undefined): UserRole {
  if (!user) return "guest";
  const claim = user.app_metadata?.role;
  if (claim === "admin" || claim === "super_admin" || claim === "guest") {
    return claim;
  }
  return "guest";
}
