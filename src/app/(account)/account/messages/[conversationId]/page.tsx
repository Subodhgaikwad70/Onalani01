import { MessagingInboxShell } from "@/components/messaging/messaging-inbox-shell";

export const dynamic = "force-dynamic";

export default async function MessageThreadRoutePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <MessagingInboxShell
      variant="guest"
      basePath="/account/messages"
      selectedConversationId={conversationId}
    />
  );
}
