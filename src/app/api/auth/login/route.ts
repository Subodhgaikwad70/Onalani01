import { jsonError, readRoleFromUser } from "@/lib/auth/session";
import { loginBodySchema, parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!rateLimit({ key: `login:${clientIp(request)}`, limit: 10, windowMs: 60_000 })) {
    return jsonError(429, "Too many login attempts; please slow down");
  }
  const { data, error } = await parseJsonBody(request, loginBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

  if (signInError) {
    return jsonError(401, signInError.message);
  }

  const user = signInData.user;
  return Response.json({
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: readRoleFromUser(user),
        }
      : null,
  });
}
