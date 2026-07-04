import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email/resend";

export type NotificationKind =
  | "booking_confirmed"
  | "booking_received"
  | "booking_cancelled"
  | "booking_request"
  | "booking_request_decided"
  | "review_window_open"
  | "review_received"
  | "message_received"
  | "promo_assigned"
  | "credit_assigned"
  | "complaint_update";

/**
 * Insert a notification row + (optionally) email it. Honors the recipient's
 * notification_preferences row to decide whether to actually send the email.
 */
export async function notify(input: {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
  email?: { subject: string; html: string; text?: string };
}): Promise<void> {
  const admin = createSupabaseAdmin();

  await admin.from("notifications").insert({
    recipient_id: input.recipientId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    payload: input.payload ?? {},
  });

  if (!input.email) return;

  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", input.recipientId)
    .maybeSingle();

  if (prefs?.digest_frequency === "off") return;

  const channelMap: Partial<Record<NotificationKind, keyof typeof prefs>> = {
    booking_confirmed: "email_bookings",
    booking_received: "email_bookings",
    booking_cancelled: "email_bookings",
    booking_request: "email_bookings",
    booking_request_decided: "email_bookings",
    review_window_open: "email_reminders",
    review_received: "email_messages",
    message_received: "email_messages",
    promo_assigned: "email_marketing",
    credit_assigned: "email_marketing",
    complaint_update: "email_messages",
  };
  const prefKey = channelMap[input.kind];
  if (prefKey && prefs && prefs[prefKey] === false) return;

  const {
    data: { user },
  } = await admin.auth.admin.getUserById(input.recipientId);
  if (!user?.email) return;

  await sendTransactionalEmail({
    to: user.email,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
  });
}
