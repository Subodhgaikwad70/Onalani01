import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/auth/session";
import { isValidPropertySlug, slugifyFromName } from "@/lib/properties";

/**
 * Generates a unique slug for a property by appending -2, -3, ... if the
 * desired slug already exists. Uses a service-role client to bypass RLS
 * for the existence checks.
 */
export async function allocateUniquePropertySlug(
  base: string,
): Promise<string> {
  const admin = createSupabaseAdmin();
  let attempt = 0;
  while (attempt < 50) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!isValidPropertySlug(candidate)) {
      throw new Error(`Could not derive a valid slug from '${base}'`);
    }
    const { data } = await admin
      .from("properties")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    attempt += 1;
  }
  throw new Error("Could not allocate a unique slug after 50 attempts");
}

export async function allocateUniqueListingSlug(base: string): Promise<string> {
  const admin = createSupabaseAdmin();
  let attempt = 0;
  while (attempt < 50) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!isValidPropertySlug(candidate)) {
      throw new Error(`Could not derive a valid slug from '${base}'`);
    }
    const { data } = await admin
      .from("listings")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    attempt += 1;
  }
  throw new Error("Could not allocate a unique listing slug");
}

/**
 * Returns the SSR Supabase client (RLS scoped to the caller). Useful inside
 * admin route handlers so that all writes are filtered by admin RLS at
 * the database level even if the handler forgets to check.
 */
export async function adminScopedClient() {
  return createSupabaseServerClient();
}

export { slugifyFromName };

export function err(status: number, message: string) {
  return jsonError(status, message);
}
