import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const prefsSchema = z.object({
  email_marketing: z.boolean().optional(),
  email_bookings: z.boolean().optional(),
  email_messages: z.boolean().optional(),
  email_reminders: z.boolean().optional(),
  push_messages: z.boolean().optional(),
  push_bookings: z.boolean().optional(),
  digest_frequency: z.enum(["instant", "daily", "off"]).optional(),
});

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", session.user.id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  return Response.json({ preferences: data });
});

export const PATCH = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, prefsSchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: upsertError } = await supabase
    .from("notification_preferences")
    .upsert(
      { profile_id: session.user.id, ...data },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single();
  if (upsertError) return jsonError(400, upsertError.message);
  return Response.json({ preferences: row });
});
