import { jsonError } from "@/lib/auth/session";
import { parseJsonBody, signupBodySchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!rateLimit({ key: `signup:${clientIp(request)}`, limit: 5, windowMs: 60_000 })) {
    return jsonError(429, "Too many signups from this IP; please slow down");
  }
  const { data, error } = await parseJsonBody(request, signupBodySchema);
  if (error) return error;

  const origin = new URL(request.url).origin;
  const next = data.next?.startsWith("/") ? data.next : "/account";
  const supabase = await createSupabaseServerClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { display_name: data.display_name },
    },
  });

  if (signUpError) {
    return jsonError(400, signUpError.message);
  }

  return Response.json({
    user: signUpData.user
      ? {
          id: signUpData.user.id,
          email: signUpData.user.email,
        }
      : null,
    needs_verification: !signUpData.session,
  });
}
