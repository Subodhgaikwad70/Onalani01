import type { ReactNode } from "react";
import { MessagingInboxBleed } from "@/components/messaging/messaging-inbox-bleed";

export default function AdminInboxLayout({ children }: { children: ReactNode }) {
  return <MessagingInboxBleed>{children}</MessagingInboxBleed>;
}
