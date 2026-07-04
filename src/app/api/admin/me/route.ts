import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const adminProfileSelect =
  "id, display_name, avatar_url, bio, phone, phone_verified_at, email_verified_at, preferred_currency, preferred_language, timezone, country_code, role, created_at, updated_at";

const adminMePatchSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  bio: z.string().trim().max(1500).optional().nullable(),
  timezone: z.string().trim().max(80).optional().nullable(),
  country_code: z.string().trim().max(2).optional().nullable(),
  preferred_currency: z.string().trim().min(3).max(3).optional(),
  preferred_language: z.string().trim().min(2).max(10).optional(),
  avatar_url: z.string().trim().max(2048).optional().nullable(),
});

/** GET /api/admin/me — staff profile for the admin console. */
export const GET = requireAdmin(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(adminProfileSelect)
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError) return jsonError(500, profileError.message);

  return Response.json({
    profile,
    role: session.role,
    email: session.user.email ?? null,
  });
});

/** PATCH /api/admin/me — update staff profile fields. */
export const PATCH = requireAdmin(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, adminMePatchSchema);
  if (error) return error;
  if (Object.keys(data).length === 0) return jsonError(400, "No fields to update");

  const supabase = await createSupabaseServerClient();

  const profilePatch: Record<string, unknown> = {};
  if (data.display_name !== undefined) profilePatch.display_name = data.display_name;
  if (data.phone !== undefined) profilePatch.phone = data.phone;
  if (data.bio !== undefined) profilePatch.bio = data.bio;
  if (data.timezone !== undefined) profilePatch.timezone = data.timezone;
  if (data.country_code !== undefined) {
    profilePatch.country_code = data.country_code?.toUpperCase() ?? null;
  }
  if (data.preferred_currency !== undefined) {
    profilePatch.preferred_currency = data.preferred_currency.toUpperCase();
  }
  if (data.preferred_language !== undefined) {
    profilePatch.preferred_language = data.preferred_language.toLowerCase();
  }
  if (data.avatar_url !== undefined) profilePatch.avatar_url = data.avatar_url;

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("id", session.user.id);
  if (profileError) return jsonError(400, profileError.message);

  const { data: profile } = await supabase
    .from("profiles")
    .select(adminProfileSelect)
    .eq("id", session.user.id)
    .maybeSingle();

  return Response.json({ profile });
});
