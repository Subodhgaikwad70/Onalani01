import { MessagingInboxShell } from "@/components/messaging/messaging-inbox-shell";

export const dynamic = "force-dynamic";

export default async function AdminMessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <MessagingInboxShell
      variant="admin"
      basePath="/admin/messages"
      selectedConversationId={conversationId}
    />
  );
}
