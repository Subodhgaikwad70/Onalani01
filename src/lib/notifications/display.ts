import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarCheck,
  CircleX,
  MessageCircle,
  Wallet,
} from "lucide-react";

export type NotificationCategory =
  | "all"
  | "bookings"
  | "messages"
  | "system"
  | "starred";

export type InboxNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  link: string | null;
  payload?: Record<string, unknown> | null;
  is_important?: boolean;
};

export type NotificationVisual = {
  Icon: LucideIcon;
  iconClass: string;
};

const BOOKING_KIND_PREFIXES = ["booking_", "review_window"];
const MESSAGE_KINDS = new Set([
  "message_received",
  "review_received",
  "complaint_update",
]);
const SYSTEM_KINDS = new Set(["credit_assigned", "promo_assigned"]);

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function notificationText(n: InboxNotification): string {
  return `${n.kind} ${n.title} ${n.body ?? ""}`.toLowerCase();
}

function isBookingKind(kind: string): boolean {
  return BOOKING_KIND_PREFIXES.some((p) => kind.startsWith(p));
}

export function categorizeNotification(
  n: InboxNotification,
): Exclude<NotificationCategory, "all" | "starred"> {
  const kind = n.kind.toLowerCase();
  const text = notificationText(n);

  if (
    MESSAGE_KINDS.has(kind) ||
    /message|support|complaint|inbox|conversation/.test(text)
  ) {
    return "messages";
  }

  if (
    SYSTEM_KINDS.has(kind) ||
    /credit|credits|promo|wallet|expir|system/.test(text)
  ) {
    return "system";
  }

  if (
    isBookingKind(kind) ||
    /booking|confirmed|declined|cancelled|stay|trip|request/.test(text)
  ) {
    return "bookings";
  }

  return "system";
}

export function getNotificationVisual(n: InboxNotification): NotificationVisual {
  const text = notificationText(n);
  const kind = n.kind.toLowerCase();

  if (
    kind.includes("declined") ||
    kind.includes("cancelled") ||
    text.includes("declined") ||
    text.includes("cancelled")
  ) {
    return { Icon: CircleX, iconClass: "text-[#717171]" };
  }

  if (
    kind.includes("confirmed") ||
    kind.includes("received") ||
    text.includes("confirmed")
  ) {
    return { Icon: CalendarCheck, iconClass: "text-[#717171]" };
  }

  if (
    MESSAGE_KINDS.has(kind) ||
    text.includes("message") ||
    text.includes("support")
  ) {
    return { Icon: MessageCircle, iconClass: "text-[#717171]" };
  }

  if (
    SYSTEM_KINDS.has(kind) ||
    text.includes("credit") ||
    text.includes("wallet")
  ) {
    return { Icon: Wallet, iconClass: "text-[#717171]" };
  }

  if (isBookingKind(kind) || text.includes("booking")) {
    return { Icon: CalendarCheck, iconClass: "text-[#717171]" };
  }

  return { Icon: Bell, iconClass: "text-[#717171]" };
}

const ADMIN_INBOX_LINK_RE = /^\/admin\/inbox\/([^/?#]+)/;

/** Guest-safe inbox path for a conversation (fixes legacy admin links on guest notifications). */
export function guestConversationHref(conversationId: string): string {
  return `/account/messages/${conversationId}`;
}

export function resolveNotificationHref(n: InboxNotification): string | null {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const conversationId = payload.conversation_id;
  const isMessage =
    n.kind === "message_received" ||
    categorizeNotification(n) === "messages";

  if (typeof conversationId === "string") {
    return guestConversationHref(conversationId);
  }

  if (n.link) {
    const adminMatch = n.link.match(ADMIN_INBOX_LINK_RE);
    if (adminMatch?.[1] && isMessage) {
      return guestConversationHref(adminMatch[1]);
    }
    if (n.link.startsWith("/")) return n.link;
  }

  const bookingCode = payload.code ?? payload.booking_code;
  if (typeof bookingCode === "string") {
    return `/account/trips/${bookingCode}`;
  }

  const bookingId = payload.booking_id;
  if (typeof bookingId === "string") {
    return `/account/trips/${bookingId}`;
  }

  const haystack = `${n.title} ${n.body ?? ""}`;
  const match = haystack.match(UUID_RE);
  if (match) {
    if (categorizeNotification(n) === "messages") {
      return `/account/messages/${match[0]}`;
    }
    return `/account/trips/${match[0]}`;
  }

  if (categorizeNotification(n) === "messages") return "/account/messages";
  if (categorizeNotification(n) === "bookings") return "/account/trips";

  return null;
}

export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function filterNotificationsByCategory(
  items: InboxNotification[],
  category: NotificationCategory,
): InboxNotification[] {
  if (category === "all") return items;
  if (category === "starred") {
    return items.filter((n) => Boolean(n.is_important));
  }
  return items.filter((n) => categorizeNotification(n) === category);
}

export function countUnreadByCategory(
  items: InboxNotification[],
): Record<NotificationCategory, number> {
  const counts: Record<NotificationCategory, number> = {
    all: 0,
    bookings: 0,
    messages: 0,
    system: 0,
    starred: 0,
  };
  for (const n of items) {
    if (!n.read_at) {
      counts.all += 1;
      counts[categorizeNotification(n)] += 1;
    }
    if (n.is_important && !n.read_at) {
      counts.starred += 1;
    }
  }
  return counts;
}

export function countStarred(items: InboxNotification[]): number {
  return items.filter((n) => n.is_important).length;
}
