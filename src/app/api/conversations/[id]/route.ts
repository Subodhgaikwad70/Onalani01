import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveConversationReference } from "@/lib/messaging/conversation-identifiers";

type Params = { id: string };

/**
 * DELETE /api/conversations/{id} — permanently remove a thread (admin only).
 * Cascades to messages and attachments.
 */
export const DELETE = requireAdmin<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const ref = await resolveConversationReference(admin, id);
  if (ref.error) return jsonError(500, ref.error.message);
  if (!ref.conversation) return jsonError(404, "Conversation not found");
  const conversationId = ref.conversation.id;

  const { data: convo, error: lookupError } = await admin
    .from("conversations")
    .select("id, booking_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (lookupError) return jsonError(500, lookupError.message);
  if (!convo) return jsonError(404, "Conversation not found");

  const { error: deleteError } = await admin
    .from("conversations")
    .delete()
    .eq("id", conversationId);
  if (deleteError) return jsonError(500, deleteError.message);

  return Response.json({ ok: true, deleted_id: conversationId });
});
