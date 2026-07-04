import { jsonError } from "@/lib/auth/session";
import { parseJsonBody, signupResendBodySchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/**
 * Resends the signup confirmation email (link + OTP) for an unverified account.
 */
export async function POST(request: Request) {
  if (
    !rateLimit({
      key: `signup-resend:${clientIp(request)}`,
      limit: 3,
      windowMs: 60_000,
    })
  ) {
    return jsonError(429, "Too many resend attempts; please wait a moment");
  }

  const { data, error } = await parseJsonBody(request, signupResendBodySchema);
  if (error) return error;

  const origin = new URL(request.url).origin;
  const next = data.next?.startsWith("/") ? data.next : "/account";
  const supabase = await createSupabaseServerClient();

  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email: data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (resendError) {
    return jsonError(400, resendError.message);
  }

  return Response.json({ ok: true });
}
