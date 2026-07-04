"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiPost } from "@/lib/api/client";
import {
  formatSystemMessageLine,
  isSystemMessage,
} from "@/lib/messaging/message-display";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  is_system?: boolean;
};

type SenderProfile = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
};

type MessageGroup =
  | { kind: "system"; message: ChatMessage }
  | { kind: "chat"; senderId: string; messages: ChatMessage[] };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    if (isSystemMessage(message)) {
      groups.push({ kind: "system", message });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "chat" && last.senderId === message.sender_id) {
      last.messages.push(message);
    } else {
      groups.push({
        kind: "chat",
        senderId: message.sender_id,
        messages: [message],
      });
    }
  }
  return groups;
}

function SystemMessageRow({
  message,
  senderName,
  showReservationLink,
  reservationHref,
}: {
  message: ChatMessage;
  senderName?: string | null;
  showReservationLink?: boolean;
  reservationHref?: string | null;
}) {
  const text = formatSystemMessageLine(message.body, { senderName });
  return (
    <div className="flex justify-center px-4 py-3">
      <p className="max-w-lg text-center text-xs leading-relaxed text-[#717171]">
        {text}
        {showReservationLink && reservationHref ? (
          <>
            {" "}
            <Link
              href={reservationHref}
              className="font-medium text-[#222222] underline underline-offset-2"
            >
              Show reservation
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

function ChatMessageGroup({
  group,
  currentUserId,
  guestProfile,
  adminProfile,
  variant,
}: {
  group: Extract<MessageGroup, { kind: "chat" }>;
  currentUserId: string;
  guestProfile?: SenderProfile | null;
  adminProfile?: SenderProfile | null;
  variant: "default" | "adminInbox";
}) {
  const first = group.messages[0];
  const mine = group.senderId === currentUserId;
  const sender =
    group.senderId === guestProfile?.id
      ? guestProfile
      : group.senderId === adminProfile?.id
        ? adminProfile
        : null;
  const senderName = sender?.display_name?.trim() || (mine ? "You" : "Guest");
  const isGuestSender = guestProfile?.id === group.senderId;
  const roleLabel = isGuestSender ? "Guest" : "Onalani";
  const timeLabel = format(new Date(first.created_at), "h:mm a").toLowerCase();

  if (variant === "adminInbox") {
    return (
      <div
        className={cn(
          "flex gap-3 px-1",
          mine ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!mine ? (
          <Avatar className="mt-6 h-9 w-9 shrink-0 border border-[#ebebeb]">
            <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-[#dddddd] text-xs font-semibold text-[#222222]">
              {initials(senderName)}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 max-w-[min(100%,520px)] flex-col",
            mine ? "items-end" : "items-start",
          )}
        >
          {!mine ? (
            <p className="mb-1 text-xs text-[#717171]">
              {senderName} · {roleLabel} · {timeLabel}
            </p>
          ) : null}
          <div
            className={cn(
              "flex w-full flex-col gap-1",
              mine ? "items-end" : "items-start",
            )}
          >
            {group.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "w-fit max-w-full rounded-2xl px-4 py-3 text-left text-[15px] leading-relaxed text-[#222222]",
                  mine
                    ? "bg-[#ebebeb]"
                    : "border border-[#e8e8e8] bg-white shadow-sm",
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const mineBubble = "bg-primary text-primary-foreground";
  const theirsBubble = "bg-muted text-foreground";

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1",
          mine ? "items-end" : "items-start",
        )}
      >
        {group.messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "w-fit max-w-full rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
              mine ? mineBubble : theirsBubble,
            )}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageThread({
  conversationId,
  realtimeConversationId,
  currentUserId,
  variant = "default",
  className,
  prepend,
  onMarkedRead,
  guestProfile,
  adminProfile,
  bookingId,
  viewerVariant = "admin",
}: {
  conversationId: string;
  realtimeConversationId?: string | null;
  currentUserId: string;
  variant?: "default" | "adminInbox";
  className?: string;
  prepend?: ReactNode;
  onMarkedRead?: () => void;
  guestProfile?: SenderProfile | null;
  adminProfile?: SenderProfile | null;
  bookingId?: string | null;
  viewerVariant?: "guest" | "admin";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const apiConversationId = encodeURIComponent(conversationId);
  const subscriptionConversationId = realtimeConversationId ?? conversationId;

  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  const groups = useMemo(() => groupMessages(sorted), [sorted]);

  const reservationHref = bookingId
    ? viewerVariant === "admin"
      ? `/admin/bookings/${bookingId}`
      : `/account/trips/${bookingId}`
    : null;

  async function refresh() {
    const res = await fetch(
      `/api/conversations/${apiConversationId}/messages?limit=80`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { messages: ChatMessage[] };
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    void refresh();
    void apiPost(`/api/conversations/${apiConversationId}/read`, {})
      .then(() => {
        onMarkedRead?.();
      })
      .catch(() => {});
  }, [apiConversationId, conversationId, onMarkedRead]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`messages:${subscriptionConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${subscriptionConversationId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [row, ...prev];
          });
          if (row.sender_id !== currentUserId) {
            void apiPost(`/api/conversations/${apiConversationId}/read`, {})
              .then(() => {
                onMarkedRead?.();
              })
              .catch(() => {});
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [apiConversationId, currentUserId, onMarkedRead, subscriptionConversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sorted.length]);

  async function send() {
    if (!draft.trim()) return;
    try {
      await apiPost(`/api/conversations/${apiConversationId}/messages`, {
        body: draft.trim(),
        attachments: [],
      });
      setDraft("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send");
    }
  }

  let lastDay: Date | null = null;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        variant === "default" &&
          "h-[min(70vh,560px)] rounded-xl border border-border bg-card",
        variant === "adminInbox" && "h-full flex-1 bg-white",
        className,
      )}
    >
      <div
        className={cn(
          "scrollbar-inbox min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
        )}
      >
        <div
          className={cn(
            variant === "adminInbox" ? "space-y-4 px-5 py-4" : "space-y-3 p-4",
          )}
        >
          {prepend ? <div className="pb-2">{prepend}</div> : null}
          {groups.map((group) => {
            const anchorDate = new Date(
              group.kind === "system"
                ? group.message.created_at
                : group.messages[0].created_at,
            );
            const showDay =
              !lastDay || !isSameDay(lastDay, anchorDate);
            if (showDay) lastDay = anchorDate;

            return (
              <div key={
                group.kind === "system"
                  ? group.message.id
                  : `${group.senderId}-${group.messages[0].id}`
              }>
                {showDay ? (
                  <div className="flex justify-center py-2">
                    <span className="text-xs font-medium text-[#717171]">
                      {dayLabel(anchorDate)}
                    </span>
                  </div>
                ) : null}
                {group.kind === "system" ? (
                  <SystemMessageRow
                    message={group.message}
                    senderName={guestProfile?.display_name}
                    showReservationLink={Boolean(bookingId)}
                    reservationHref={reservationHref}
                  />
                ) : (
                  <ChatMessageGroup
                    group={group}
                    currentUserId={currentUserId}
                    guestProfile={guestProfile}
                    adminProfile={adminProfile}
                    variant={variant}
                  />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 gap-2 border-t border-border",
          variant === "adminInbox"
            ? "border-[#ebebeb] bg-[#fafafa] px-4 py-3"
            : "p-3",
        )}
      >
        <Input
          id="conversation-compose-input"
          placeholder="Write a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className={
            variant === "adminInbox"
              ? "rounded-full border-[#dcdcdc] bg-white shadow-none"
              : undefined
          }
        />
        <Button
          type="button"
          onClick={send}
          className={
            variant === "adminInbox"
              ? " shrink-0 rounded-full bg-[#a8d4e6] px-5 hover:bg-[#c0edff]"
              : undefined
          }
        >
          Send
        </Button>
      </div>
    </div>
  );
}
