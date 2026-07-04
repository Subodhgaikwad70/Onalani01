import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const referralBodySchema = z.object({
  email: z.string().email(),
});

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  return Response.json({ referrals: data ?? [] });
});

export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, referralBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("referrals")
    .insert({
      referrer_id: session.user.id,
      referred_email: data.email.toLowerCase(),
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ referral: row }, { status: 201 });
});
