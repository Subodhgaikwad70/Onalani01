import { MessagingInboxShell } from "@/components/messaging/messaging-inbox-shell";

export default function MessagesIndexPage() {
  return <MessagingInboxShell variant="guest" basePath="/account/messages" />;
}
