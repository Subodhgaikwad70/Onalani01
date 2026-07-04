"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import {
  countStarred,
  countUnreadByCategory,
  filterNotificationsByCategory,
  formatNotificationTimestamp,
  getNotificationVisual,
  resolveNotificationHref,
  type InboxNotification,
  type NotificationCategory,
} from "@/lib/notifications/display";
import { cn } from "@/lib/utils";

const CATEGORY_TABS: { value: NotificationCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bookings", label: "Bookings" },
  { value: "messages", label: "Messages" },
  { value: "system", label: "Credits" },
  { value: "starred", label: "Starred" },
];

async function fetchNotifications(): Promise<InboxNotification[]> {
  const res = await fetch("/api/guests/me/notifications?limit=100", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("notifications");
  const json = (await res.json()) as { notifications: InboxNotification[] };
  return json.notifications ?? [];
}

async function patchNotifications(
  ids: string[],
  patch: { read?: boolean; important?: boolean },
) {
  const res = await fetch("/api/guests/me/notifications", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, ...patch }),
  });
  if (!res.ok) throw new Error("patch");
}

function NotificationRow({
  notification,
  onOpen,
  onToggleImportant,
  starring,
}: {
  notification: InboxNotification;
  onOpen: (n: InboxNotification) => void;
  onToggleImportant: (n: InboxNotification) => void;
  starring: boolean;
}) {
  const unread = !notification.read_at;
  const important = Boolean(notification.is_important);
  const visual = getNotificationVisual(notification);
  const { Icon } = visual;

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 border-b border-[#e2e8e4] px-4 py-3 transition-colors duration-150 last:border-b-0 sm:px-5",
        "hover:bg-[#F7F7F7]",
        !unread && "opacity-[0.72]",
      )}
      onClick={() => onOpen(notification)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(notification);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {unread ? (
        <span
          className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-[#222222]"
          aria-hidden
        />
      ) : null}

      <div className="flex h-8 w-8 shrink-0 items-center justify-center text-[#717171]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </div>

      <div className="min-w-0 flex-1 pr-8">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-[14px] leading-tight text-[#222222] transition-colors duration-150",
              unread ? "font-semibold" : "font-normal",
            )}
          >
            {notification.title}
          </p>
          <time
            className="shrink-0 text-[12px] tabular-nums text-[#717171]"
            dateTime={notification.created_at}
          >
            {formatNotificationTimestamp(notification.created_at)}
          </time>
        </div>
        {notification.body ? (
          <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-[#717171]">
            {notification.body}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className="absolute right-3 top-3 rounded-full p-1 text-[#717171] transition hover:bg-white hover:text-[#222222]"
        aria-label={important ? "Remove from starred" : "Save notification"}
        aria-pressed={important}
        disabled={starring}
        onClick={(e) => {
          e.stopPropagation();
          onToggleImportant(notification);
        }}
      >
        {starring ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : (
          <Star
            className={cn(
              "h-[18px] w-[18px] transition-colors duration-150",
              important
                ? "fill-[#222222] text-[#222222]"
                : "fill-transparent hover:text-[#222222]",
            )}
            strokeWidth={1.75}
          />
        )}
      </button>
    </div>
  );
}

export function NotificationsInbox() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<NotificationCategory>("all");
  const [pendingStarId, setPendingStarId] = useState<string | null>(null);

  const { data: notifications = [], isPending, isError, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
  });

  const unreadCounts = useMemo(
    () => countUnreadByCategory(notifications),
    [notifications],
  );
  const starredTotal = useMemo(() => countStarred(notifications), [notifications]);

  const filteredList = useMemo(
    () => filterNotificationsByCategory(notifications, activeTab),
    [notifications, activeTab],
  );

  const patchCache = (updater: (items: InboxNotification[]) => InboxNotification[]) => {
    queryClient.setQueryData<InboxNotification[]>(["notifications"], (old) =>
      updater(old ?? []),
    );
  };

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/guests/me/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error("mark_all");
    },
    onMutate: () => {
      patchCache((items) =>
        items.map((n) => ({
          ...n,
          read_at: n.read_at ?? new Date().toISOString(),
        })),
      );
    },
    onError: () => {
      toast.error("Could not mark all as read");
      void refetch();
    },
  });

  const toggleImportant = useMutation({
    mutationFn: async ({ id, important }: { id: string; important: boolean }) => {
      await patchNotifications([id], { important });
    },
    onMutate: ({ id, important }) => {
      setPendingStarId(id);
      patchCache((items) =>
        items.map((n) => (n.id === id ? { ...n, is_important: important } : n)),
      );
    },
    onSettled: () => setPendingStarId(null),
    onError: () => {
      toast.error("Could not update saved notification");
      void refetch();
    },
  });

  function handleOpen(n: InboxNotification) {
    if (!n.read_at) {
      patchCache((items) =>
        items.map((item) =>
          item.id === n.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
      void patchNotifications([n.id], { read: true }).catch(() => {
        void refetch();
      });
    }

    const href = resolveNotificationHref(n);
    if (href) {
      router.push(href);
    }
  }

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#717171]">
          {unreadCounts.all > 0
            ? `${unreadCounts.all} unread`
            : "You're all caught up"}
        </p>
        {unreadCounts.all > 0 ? (
          <button
            type="button"
            className="text-[13px] font-medium text-[#222222] underline underline-offset-2 transition hover:text-black disabled:opacity-40"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? "Updating…" : "Mark all as read"}
          </button>
        ) : null}
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Notification categories"
      >
        {CATEGORY_TABS.map((tab) => {
          const active = activeTab === tab.value;
          const count =
            tab.value === "starred"
              ? starredTotal
              : tab.value === "all"
                ? unreadCounts.all
                : unreadCounts[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150",
                active
                  ? "border-[#222222] bg-[#222222] text-white"
                  : "border-[#DDDDDD] bg-white text-[#717171] hover:border-[#222222] hover:text-[#222222]",
              )}
            >
              {tab.label}
              {count > 0 && tab.value !== "starred" ? (
                <span
                  className={cn(
                    "ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full px-1 text-[11px] font-semibold leading-[1.15rem]",
                    active ? "bg-white/20 text-white" : "bg-[#F7F7F7] text-[#222222]",
                  )}
                >
                  {count}
                </span>
              ) : null}
              {tab.value === "starred" && starredTotal > 0 ? (
                <span
                  className={cn(
                    "ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full px-1 text-[11px] font-semibold leading-[1.15rem]",
                    active ? "bg-white/20 text-white" : "bg-[#F7F7F7] text-[#222222]",
                  )}
                >
                  {starredTotal}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-[#e2e8e4] bg-white shadow-sm">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#717171]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : isError ? (
          <div className="px-4 py-12 text-center text-[13px] text-[#717171]">
            Could not load notifications.{" "}
            <button
              type="button"
              className="font-medium text-[#222222] underline"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-[#F7F7F7] px-4 py-14 text-center">
            <p className="text-[14px] font-medium text-[#222222]">
              {activeTab === "starred"
                ? "No starred notifications"
                : "No notifications yet"}
            </p>
            <p className="mt-1 text-[13px] text-[#717171]">
              {activeTab === "starred"
                ? "Tap the star on any alert to save it here."
                : "Booking updates, messages, and credits will appear in this feed."}
            </p>
          </div>
        ) : (
          filteredList.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onOpen={handleOpen}
              onToggleImportant={(item) =>
                toggleImportant.mutate({
                  id: item.id,
                  important: !item.is_important,
                })
              }
              starring={pendingStarId === n.id}
            />
          ))
        )}
      </div>
    </section>
  );
}
