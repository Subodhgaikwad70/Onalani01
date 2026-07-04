import { jsonError } from "@/lib/auth/session";
import { parseJsonBody, resetRequestBodySchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!rateLimit({ key: `reset:${clientIp(request)}`, limit: 5, windowMs: 60_000 })) {
    return jsonError(429, "Too many password reset requests");
  }
  const { data, error } = await parseJsonBody(request, resetRequestBodySchema);
  if (error) return error;

  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
    data.email,
    { redirectTo: `${origin}/auth/reset` },
  );

  if (resetError) {
    return jsonError(400, resetError.message);
  }

  // Always return success to avoid leaking which emails are registered.
  return Response.json({ ok: true });
}
