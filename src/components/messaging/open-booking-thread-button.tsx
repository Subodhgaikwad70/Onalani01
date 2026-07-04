"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { ensureBookingConversation } from "@/lib/messaging/ensure-booking-conversation";
import { cn } from "@/lib/utils";

export function OpenBookingThreadButton({
  bookingId,
  inboxBasePath,
  className,
  variant = "outline",
  children,
}: {
  bookingId: string;
  inboxBasePath: "/account/messages" | "/admin/inbox";
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  children?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function openThread() {
    setBusy(true);
    try {
      const conversationId = await ensureBookingConversation(bookingId);
      router.push(`${inboxBasePath}/${conversationId}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not open messages");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={cn(className)}
      disabled={busy}
      onClick={() => void openThread()}
    >
      {busy ? "Opening…" : (children ?? "Messages")}
    </Button>
  );
}
