import { z } from "zod";

export const emailSchema = z.string().trim().email("Invalid email").max(254);
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);
export const displayNameSchema = z.string().trim().min(1).max(80);

export const signupBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: displayNameSchema,
  next: z.string().optional(),
});

export const signupResendBodySchema = z.object({
  email: emailSchema,
  next: z.string().optional(),
});

export const signupVerifyOtpBodySchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(4).max(10),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const resetRequestBodySchema = z.object({
  email: emailSchema,
});

export const otpSendBodySchema = z.object({
  email: emailSchema,
});

export const otpVerifyBodySchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(4).max(10),
});

export const phoneSendBodySchema = z.object({
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Invalid phone number"),
});

export const phoneVerifyBodySchema = z.object({
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
  code: z.string().trim().regex(/^[0-9]{4,8}$/),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type SignupResendBody = z.infer<typeof signupResendBodySchema>;
export type SignupVerifyOtpBody = z.infer<typeof signupVerifyOtpBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type ResetRequestBody = z.infer<typeof resetRequestBodySchema>;
export type OtpSendBody = z.infer<typeof otpSendBodySchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type PhoneSendBody = z.infer<typeof phoneSendBodySchema>;
export type PhoneVerifyBody = z.infer<typeof phoneVerifyBodySchema>;

/**
 * Parses an incoming Request body as JSON and validates it against `schema`.
 * Returns either { data } or { error } where `error` is a Response we can
 * return directly from a route handler.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; error: null } | { data: null; error: Response }> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return {
      data: null,
      error: Response.json(
        { error: { message: "Request body must be valid JSON" } },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      data: null,
      error: Response.json(
        {
          error: {
            message: "Invalid request body",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      ),
    };
  }

  return { data: parsed.data, error: null };
}
