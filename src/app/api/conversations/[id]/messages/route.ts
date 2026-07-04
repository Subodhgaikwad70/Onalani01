import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/notify";
import {
  conversationPublicIdentifier,
  resolveConversationReference,
} from "@/lib/messaging/conversation-identifiers";

type Params = { id: string };

const messageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachments: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        url: z.string().url(),
        content_type: z.string().max(120).optional(),
        size_bytes: z.number().int().min(0).optional(),
      }),
    )
    .max(10)
    .default([]),
});

/** GET /api/conversations/{id}/messages */
export const GET = requireAuth<Params>(async (req, ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const supabase = await createSupabaseServerClient();
  const ref = await resolveConversationReference(supabase, id);
  if (ref.error) return jsonError(500, ref.error.message);
  if (!ref.conversation) return jsonError(404, "Conversation not found");
  let query = supabase
    .from("messages")
    .select("*, message_attachments(*)")
    .eq("conversation_id", ref.conversation.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  return Response.json({ messages: data ?? [] });
});

/** POST /api/conversations/{id}/messages */
export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, messageBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const ref = await resolveConversationReference(supabase, id);
  if (ref.error) return jsonError(500, ref.error.message);
  if (!ref.conversation) return jsonError(404, "Conversation not found");
  const conversationId = ref.conversation.id;
  const { data: msg, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: session.user.id,
      body: data.body,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);

  if (data.attachments.length > 0) {
    await supabase.from("message_attachments").insert(
      data.attachments.map((a) => ({
        message_id: msg.id,
        storage_path: a.storage_path,
        url: a.url,
        content_type: a.content_type ?? null,
        size_bytes: a.size_bytes ?? null,
      })),
    );
  }

  const admin = createSupabaseAdmin();
  const { data: convo } = await admin
    .from("conversations")
    .select("id, guest_id, admin_id, subject, booking:bookings!conversations_booking_id_fkey(code)")
    .eq("id", conversationId)
    .maybeSingle();

  if (convo) {
    if (isAdminRole(session.role) && !convo.admin_id) {
      await admin
        .from("conversations")
        .update({ admin_id: session.user.id })
        .eq("id", conversationId);
      convo.admin_id = session.user.id;
    }

    const otherId =
      session.user.id === convo.guest_id
        ? convo.admin_id
        : convo.guest_id;
    if (otherId) {
      const publicConversationId = conversationPublicIdentifier(convo);
      const { data: recipient } = await admin
        .from("profiles")
        .select("role")
        .eq("id", otherId)
        .maybeSingle();
      const link = isAdminRole(recipient?.role)
        ? `/admin/inbox/${publicConversationId}`
        : `/account/messages/${publicConversationId}`;
      await notify({
        recipientId: otherId,
        kind: "message_received",
        title: isAdminRole(session.role) ? "New message from support" : "New message",
        body: data.body.slice(0, 140),
        link,
        payload: {
          conversation_id: publicConversationId,
          conversation_uuid: conversationId,
          message_id: msg.id,
        },
        email: {
          subject: convo.subject
            ? `Message: ${convo.subject}`
            : "You have a new message on Onalani",
          html: `<p>You have a new message:</p><blockquote>${escapeHtml(data.body.slice(0, 500))}</blockquote><p><a href="${process.env.APP_BASE_URL ?? ""}${link}">Open conversation</a></p>`,
        },
      });
    }
  }

  return Response.json({ message: msg }, { status: 201 });
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
