import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveConversationReference } from "@/lib/messaging/conversation-identifiers";

type Params = { id: string };

/** POST /api/conversations/{id}/read — mark messages from the other party as read. */
export const POST = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const ref = await resolveConversationReference(supabase, id);
  if (ref.error) return jsonError(500, ref.error.message);
  if (!ref.conversation) return jsonError(404, "Conversation not found");
  const conversationId = ref.conversation.id;

  const { data: convo, error: convoError } = await supabase
    .from("conversations")
    .select("guest_id, admin_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convoError) return jsonError(500, convoError.message);
  if (!convo) return jsonError(404, "Conversation not found");

  const isGuest = convo.guest_id === session.user.id;
  const isAssignedAdmin = convo.admin_id === session.user.id;
  if (!isGuest && !isAssignedAdmin && !isAdminRole(session.role)) {
    return jsonError(403, "Not a participant");
  }

  const admin = createSupabaseAdmin();
  const { error: messagesError } = await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", session.user.id)
    .is("read_at", null);
  if (messagesError) return jsonError(500, messagesError.message);

  const unreadPatch = isAdminRole(session.role)
    ? { guest_unread_count: 0, admin_unread_count: 0 }
    : isGuest
      ? { guest_unread_count: 0 }
      : { admin_unread_count: 0 };

  const { error: conversationError } = await admin
    .from("conversations")
    .update(unreadPatch)
    .eq("id", conversationId);
  if (conversationError) return jsonError(500, conversationError.message);

  return Response.json({ ok: true });
});
