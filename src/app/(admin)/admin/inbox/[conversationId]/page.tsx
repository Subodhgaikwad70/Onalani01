import { AdminInboxShell } from "@/components/admin/admin-inbox-shell";

export const dynamic = "force-dynamic";

export default async function HostInboxThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <AdminInboxShell selectedConversationId={conversationId} />;
}
