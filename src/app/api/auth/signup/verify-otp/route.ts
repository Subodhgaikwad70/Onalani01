import { jsonError, readRoleFromUser } from "@/lib/auth/session";
import { parseJsonBody, signupVerifyOtpBodySchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verifies the OTP from a signup confirmation email and establishes a session.
 */
export async function POST(request: Request) {
  const { data, error } = await parseJsonBody(request, signupVerifyOtpBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email: data.email,
    token: data.token,
    type: "signup",
  });

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
