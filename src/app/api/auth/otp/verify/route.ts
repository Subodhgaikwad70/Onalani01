import { jsonError, readRoleFromUser } from "@/lib/auth/session";
import { otpVerifyBodySchema, parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verifies the 6-digit code emailed to the user. On success establishes the
 * session via the cookie store (handled inside the @supabase/ssr client).
 */
export async function POST(request: Request) {
  const { data, error } = await parseJsonBody(request, otpVerifyBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp(
    {
      email: data.email,
      token: data.token,
      type: "email",
    },
  );

  if (verifyError) {
    return jsonError(400, verifyError.message);
  }

  const user = verifyData.user;
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
