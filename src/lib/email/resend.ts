import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL ?? "Onalani <noreply@onalani.com>";

/**
 * Send a transactional email via Resend. Silent no-op if RESEND_API_KEY is
 * not configured (so local dev can run without an email provider). Returns
 * `false` if the send was skipped or failed; throws on Resend errors only when
 * the API key is set.
 */
export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
}): Promise<boolean> {
  const client = getResend();
  if (!client) {
    console.info("[email] skipped (RESEND_API_KEY not set)", input.subject);
    return false;
  }
  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.reply_to,
    });
    if (error) {
      console.error("[email] send failed", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send exception", e);
    return false;
  }
}
