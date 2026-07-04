import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const guestProfileSelect =
  "id, display_name, avatar_url, bio, phone, phone_verified_at, email_verified_at, preferred_currency, preferred_language, timezone, country_code, created_at, updated_at";

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "Avatar URL must be HTTP(S)",
  });

const guestMePatchSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  timezone: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z_]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?$/)
    .optional()
    .nullable(),
  country_code: z.string().trim().regex(/^[A-Za-z]{2}$/).optional().nullable(),
  preferred_currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  preferred_language: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
    .optional(),
  avatar_url: optionalUrl.optional().nullable(),
});

/** GET /api/guests/me — signed-in guest profile. */
export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(guestProfileSelect)
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);

  return Response.json({
    profile,
    email: session.user.email ?? null,
  });
});

/** PATCH /api/guests/me — update guest profile fields. */
export const PATCH = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, guestMePatchSchema);
  if (error) return error;
  if (Object.keys(data).length === 0) return jsonError(400, "No fields to update");

  const supabase = await createSupabaseServerClient();

  const profilePatch: Record<string, unknown> = {};
  if (data.display_name !== undefined) profilePatch.display_name = data.display_name;
  if (data.bio !== undefined) profilePatch.bio = data.bio;
  if (data.phone !== undefined) profilePatch.phone = data.phone;
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

  const { error: updateError } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("id", session.user.id);
  if (updateError) return jsonError(400, updateError.message);

  const { data: profile } = await supabase
    .from("profiles")
    .select(guestProfileSelect)
    .eq("id", session.user.id)
    .maybeSingle();

  return Response.json({ profile });
});
