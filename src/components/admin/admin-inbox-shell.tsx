import { MessagingInboxShell } from "@/components/messaging/messaging-inbox-shell";

export function AdminInboxShell({
  selectedConversationId = null,
}: {
  selectedConversationId?: string | null;
}) {
  return (
    <MessagingInboxShell
      variant="admin"
      basePath="/admin/inbox"
      selectedConversationId={selectedConversationId}
    />
  );
}
