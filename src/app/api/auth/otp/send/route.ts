import { jsonError } from "@/lib/auth/session";
import { otpSendBodySchema, parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends a magic-link / 6-digit OTP to the given email. The same flow handles
 * both signup verification and passwordless login; Supabase auto-creates a
 * user on first OTP if shouldCreateUser is true.
 */
export async function POST(request: Request) {
  const { data, error } = await parseJsonBody(request, otpSendBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: data.email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    return jsonError(400, otpError.message);
  }

  return Response.json({ ok: true });
}
