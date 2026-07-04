"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, Search, Settings } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminDeleteConversationButton } from "@/components/messaging/admin-delete-conversation-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageThread } from "@/components/messaging/message-thread";
import { parsePricingBreakdown } from "@/lib/bookings/display";
import { formatDate, formatMoney } from "@/lib/format";
import { getListingPrimaryPhoto } from "@/lib/listings";
import { useSupabaseSession } from "@/lib/supabase/session-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { ApiError, apiPost } from "@/lib/api/client";
import { conversationPublicIdentifier } from "@/lib/messaging/conversation-identifiers";

export type MessagingInboxVariant = "guest" | "admin";

type ProfileMini = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type BookingMini = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number | null;
  total_cents: number;
  currency: string;
  adults: number | null;
  children: number | null;
};

type ListingEmbed = {
  slug?: string | null;
  unit_type?: string | null;
  unit_description?: string | null;
  photos_url?: string[] | null;
  roomPhotos_url?: string[] | null;
  properties?: { property_name?: string | null; photos_url?: string[] | null } | null;
};

type BookingDetail = BookingMini & {
  subtotal_cents?: number;
  credit_applied_cents?: number | null;
  promo_discount_cents?: number | null;
  pricing_breakdown?: unknown;
  listings?: ListingEmbed | ListingEmbed[] | null;
};

type InboxConversation = {
  id: string;
  booking_id: string | null;
  listing_id?: string | null;
  subject: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  guest_unread_count: number;
  admin_unread_count: number;
  guest?: ProfileMini | null;
  admin?: ProfileMini | null;
  booking?: (BookingMini & { listings?: ListingEmbed | ListingEmbed[] | null }) | null;
  listing?: ListingEmbed | ListingEmbed[] | null;
};

function inquirySnippet(
  listing: ListingEmbed | ListingEmbed[] | null | undefined,
): string | null {
  const row = normalizeListing(listing);
  return row?.properties?.property_name ?? row?.unit_type ?? null;
}

function staySnippetFromBookingListing(
  booking: BookingMini & { listings?: ListingEmbed | ListingEmbed[] | null },
): string | null {
  const listing = normalizeListing(booking.listings);
  return listing?.properties?.property_name ?? listing?.unit_type ?? null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s =
    parts.length >= 2
      ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`
      : (parts[0]?.slice(0, 2) ?? "?");
  return s.toUpperCase();
}

function normalizeListing(
  raw: ListingEmbed | ListingEmbed[] | null | undefined,
): ListingEmbed | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function bookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: "Pending payment",
    requested: "Request",
    confirmed: "Confirmed",
    in_stay: "Checking in",
    completed: "Completed",
    cancelled_by_guest: "Cancelled",
    cancelled_by_admin: "Cancelled",
    expired: "Expired",
    declined: "Declined",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

type ConversationHighlight =
  | "confirmed"
  | "request"
  | "change_request"
  | "cancelled"
  | "default";

function conversationHighlight(
  booking: BookingMini | null | undefined,
  preview: string | null,
): ConversationHighlight {
  const text = preview ?? "";
  if (text.includes("[Change request]")) return "change_request";
  if (!booking) return "default";
  if (booking.status === "confirmed" || booking.status === "in_stay") {
    return "confirmed";
  }
  if (booking.status === "requested" || booking.status === "pending_payment") {
    return "request";
  }
  if (
    booking.status.startsWith("cancelled") ||
    booking.status === "declined" ||
    booking.status === "expired"
  ) {
    return "cancelled";
  }
  return "default";
}

function statusHighlightClass(highlight: ConversationHighlight): string {
  switch (highlight) {
    case "confirmed":
      return "font-semibold text-emerald-700";
    case "request":
      return "font-semibold text-amber-700";
    case "change_request":
      return "font-semibold text-violet-700";
    case "cancelled":
      return "font-semibold text-[#717171]";
    default:
      return "text-[#717171]";
  }
}

function statusRowAccentClass(highlight: ConversationHighlight): string {
  switch (highlight) {
    case "confirmed":
      return "border-l-[3px] border-l-emerald-500";
    case "request":
      return "border-l-[3px] border-l-amber-500";
    case "change_request":
      return "border-l-[3px] border-l-violet-500";
    case "cancelled":
      return "border-l-[3px] border-l-[#b0b0b0]";
    default:
      return "border-l-[3px] border-l-transparent";
  }
}

function inboxPeerAvatar(
  variant: MessagingInboxVariant,
  peerProfile: ProfileMini | null | undefined,
  booking: (BookingMini & { listings?: ListingEmbed | ListingEmbed[] | null }) | null | undefined,
  listing: ListingEmbed | ListingEmbed[] | null | undefined,
): { imageSrc?: string; fallback: string; fallbackClassName: string } {
  if (peerProfile?.avatar_url) {
    return {
      imageSrc: peerProfile.avatar_url,
      fallback: initials(peerProfile.display_name),
      fallbackClassName: "bg-[#dddddd] text-sm font-semibold text-[#222222]",
    };
  }

  if (variant === "guest") {
    const listingRow =
      normalizeListing(booking?.listings) ?? normalizeListing(listing);
    const thumb =
      (listingRow && getListingPrimaryPhoto(listingRow)) ??
      listingRow?.properties?.photos_url?.find((u) => u.trim().length > 0) ??
      null;
    if (thumb) {
      return {
        imageSrc: thumb,
        fallback: "O",
        fallbackClassName: "bg-[#8ecae6] text-sm font-semibold text-white",
      };
    }
    return {
      fallback: "O",
      fallbackClassName: "bg-[#8ecae6] text-sm font-semibold text-white",
    };
  }

  if (peerProfile) {
    return {
      fallback: initials(peerProfile.display_name),
      fallbackClassName: "bg-[#dddddd] text-sm font-semibold text-[#222222]",
    };
  }

  return {
    fallback: variant === "admin" ? "↔" : "?",
    fallbackClassName: "bg-[#dddddd] text-sm font-semibold text-[#222222]",
  };
}

function formatStayRange(checkIn: string, checkOut: string) {
  const start = formatDate(checkIn, undefined, {
    month: "short",
    day: "numeric",
  });
  const end = formatDate(checkOut, undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

function AdminRequestActions({
  bookingId,
  onDone,
}: {
  bookingId: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);

  async function approve() {
    setBusy("approve");
    try {
      await apiPost(`/api/bookings/${bookingId}/approve`);
      toast.success("Request approved. The guest will complete payment if required.");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not approve");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    try {
      await apiPost(`/api/bookings/${bookingId}/decline`);
      toast.success("Request declined.");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not decline");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 grid gap-2">
      <Button
        type="button"
        className="h-10 w-full rounded-lg bg-[#FF385C] text-sm font-semibold text-white hover:bg-[#E31C5F]"
        disabled={busy !== null}
        onClick={() => void approve()}
      >
        {busy === "approve" ? "Approving…" : "Approve request"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full rounded-lg border-[#b0b0b0]"
        disabled={busy !== null}
        onClick={() => void decline()}
      >
        {busy === "decline" ? "Declining…" : "Decline"}
      </Button>
    </div>
  );
}

function SidebarLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className={muted ? "text-[#717171]" : "text-[#222222]"}>{label}</span>
      <span
        className={cn(
          "max-w-[60%] text-right",
          muted ? "text-[#717171]" : "font-medium text-[#222222]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ThreadContextCard({
  viewerVariant,
  booking,
  listing,
}: {
  viewerVariant: MessagingInboxVariant;
  booking: BookingMini;
  listing: ListingEmbed | null;
}) {
  const thumb =
    (listing && getListingPrimaryPhoto(listing)) ??
    listing?.properties?.photos_url?.find((u) => u.trim().length > 0) ??
    null;
  const title =
    listing?.properties?.property_name ??
    listing?.unit_type ??
    "Reservation";
  const guests =
    (booking.adults ?? 0) +
    (booking.children ?? 0);
  const guestLabel =
    guests === 1 ? "1 guest" : `${Math.max(guests, 1)} guests`;

  return (
    <div className="overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-sm">
      <div className="flex gap-3 p-3">
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-white">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#222222]">
            {formatMoney(booking.total_cents, booking.currency)} · {guestLabel}
          </p>
          <p className="mt-0.5 text-xs text-[#717171]">
            {formatStayRange(booking.check_in, booking.check_out)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-[#222222]">{title}</p>
          <p className="mt-2 text-xs text-[#717171]">
            {bookingStatusLabel(booking.status)}
            {booking.nights != null && booking.nights > 0
              ? ` · ${booking.nights} night${booking.nights === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </div>
      {viewerVariant === "admin" &&
        (booking.status === "requested" || booking.status === "pending_payment") && (
          <div className="border-t border-[#ebebeb] bg-[#fafafa] px-3 py-2">
            <Button
              type="button"
              className="h-9 w-full rounded-lg bg-[#FF385C] text-sm font-semibold text-white hover:bg-[#E31C5F]"
              variant="default"
              onClick={() => {
                document.getElementById("conversation-compose-input")?.focus();
              }}
            >
              Respond
            </Button>
            <p className="mt-2 text-center text-[11px] text-[#717171]">
              Reply below to send your response to the guest.
            </p>
          </div>
        )}
      {viewerVariant === "guest" && booking.status === "pending_payment" ? (
        <div className="border-t border-[#ebebeb] bg-[#fafafa] px-3 py-2">
          <Button
            type="button"
            className="h-9 w-full rounded-lg bg-[#FF385C] text-sm font-semibold text-white hover:bg-[#E31C5F]"
            variant="default"
            asChild
          >
            <Link href={`/checkout/${booking.code}`}>Complete payment</Link>
          </Button>
        </div>
      ) : null}
      {viewerVariant === "guest" && booking.status === "requested" ? (
        <div className="border-t border-[#ebebeb] px-3 py-2 text-center text-[11px] text-[#717171]">
          Waiting for the Onalani team to respond to this request.
        </div>
      ) : null}
    </div>
  );
}

function ParticipantRow({
  label,
  profile,
}: {
  label: string;
  profile: ProfileMini;
}) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-10 w-10 shrink-0 border border-[#ebebeb]">
        <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-[#dddddd] text-xs font-semibold text-[#222222]">
          {initials(profile.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-[#717171]">
          {label}
        </p>
        <p className="truncate font-semibold text-[#222222]">{profile.display_name}</p>
      </div>
    </div>
  );
}

function ReservationSidebar({
  variant,
  guest,
  staffProfile,
  booking,
  listing,
  conversationId,
  onBookingMutated,
}: {
  variant: MessagingInboxVariant;
  guest: ProfileMini | null;
  staffProfile: ProfileMini | null;
  booking:
    | BookingDetail
    | (BookingMini & {
        listings?: ListingEmbed | ListingEmbed[] | null;
        pricing_breakdown?: unknown;
        subtotal_cents?: number;
        credit_applied_cents?: number | null;
        promo_discount_cents?: number | null;
      })
    | null;
  listing: ListingEmbed | null;
  conversationId?: string | null;
  onBookingMutated?: () => void;
}) {
  const breakdown = booking ? parsePricingBreakdown(booking.pricing_breakdown) : null;
  const listingRow = booking ? normalizeListing(booking.listings) : listing;
  const thumb =
    (listingRow && getListingPrimaryPhoto(listingRow)) ??
    listingRow?.properties?.photos_url?.find((u) => u.trim().length > 0) ??
    null;
  const stayTitle =
    listingRow?.properties?.property_name ??
    listingRow?.unit_type ??
    "Listing";

  const adults = booking?.adults ?? 0;
  const children = booking?.children ?? 0;
  const guestTotal = adults + children;
  const guestSummary =
    guestTotal <= 0
      ? "Guests"
      : `${adults} adult${adults === 1 ? "" : "s"}${
          children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""
        }`;

  const nightlyAvg =
    breakdown && breakdown.nights > 0
      ? Math.round(breakdown.subtotal_cents / breakdown.nights)
      : null;

  const sidebarTitle =
    variant === "guest" ? "Your trip" : variant === "admin" ? "Conversation" : "Reservation";
  const breakdownTitle =
    variant === "admin"
      ? "Potential earnings"
      : variant === "guest"
        ? "Trip cost"
        : "Booking snapshot";

  const primaryProfile =
    variant === "admin" ? guest : variant === "guest" ? staffProfile : null;

  const tripsHref = booking ? `/account/trips/${booking.code}` : "/account/trips";

  return (
    <div className="scrollbar-inbox flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-[#ebebeb] bg-white lg:border-l">
      <div className="flex items-center justify-between border-b border-[#ebebeb] px-4 py-3">
        <h2 className="text-base font-semibold text-[#222222]">{sidebarTitle}</h2>
      </div>

      {variant === "admin" ? (
        <div className="space-y-4 border-b border-[#ebebeb] px-4 py-4">
          {guest ? <ParticipantRow label="Guest" profile={guest} /> : null}
          {staffProfile ? <ParticipantRow label="Support" profile={staffProfile} /> : null}
          <div className="space-y-1 font-mono text-[11px] leading-relaxed text-[#717171]">
            {conversationId ? <p>Conversation {conversationId}</p> : null}
            {booking ? <p>Booking #{booking.code}</p> : null}
          </div>
          {booking?.status === "requested" ? (
            <AdminRequestActions bookingId={booking.code} onDone={onBookingMutated} />
          ) : null}
        </div>
      ) : primaryProfile || variant === "guest" ? (
        <div className="border-b border-[#ebebeb] px-4 py-4">
          <div className="flex gap-3">
            <Avatar className="h-12 w-12 border border-[#ebebeb]">
              <AvatarImage
                src={primaryProfile?.avatar_url ?? thumb ?? undefined}
                alt=""
              />
              <AvatarFallback className="bg-[#8ecae6] text-sm font-semibold text-white">
                {primaryProfile ? initials(primaryProfile.display_name) : "O"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {variant === "guest" ? (
                <p className="text-xs text-[#717171]">Onalani support</p>
              ) : null}
              <p className="font-semibold text-[#222222]">
                {primaryProfile?.display_name ?? "Onalani"}
              </p>
              {booking ? (
                <p className="mt-0.5 font-mono text-xs text-[#717171]">
                  #{booking.code}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-[#717171]">
                {booking
                  ? formatStayRange(booking.check_in, booking.check_out)
                  : "No dates yet"}
              </p>
              {booking ? (
                <p className="mt-1 text-sm font-semibold text-[#222222]">
                  {formatMoney(booking.total_cents, booking.currency)} total
                </p>
              ) : null}
            </div>
          </div>

        </div>
      ) : (
        <div className="border-b border-[#ebebeb] px-4 py-4 text-sm text-[#717171]">
          Profile details are not available for this thread yet.
        </div>
      )}

      <div className="space-y-4 px-4 py-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
            Booking details
          </h3>
          <div className="mt-3 space-y-2">
            <SidebarLine label="Guests" value={guestSummary} />
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-[#717171]">Check-in</span>
              <span className="max-w-[60%] text-right font-medium text-[#222222]">
                {booking
                  ? formatDate(booking.check_in, undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-[#717171]">Check-out</span>
              <span className="max-w-[60%] text-right font-medium text-[#222222]">
                {booking
                  ? formatDate(booking.check_out, undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            {booking && (booking.credit_applied_cents ?? 0) > 0 ? (
              <SidebarLine
                label="Credits used at booking"
                value={formatMoney(booking.credit_applied_cents ?? 0, booking.currency)}
              />
            ) : null}
            {variant === "admin" ? (
              <Link
                href="/admin/calendar"
                className="inline-block text-sm font-semibold text-[#222222] underline"
              >
                Show calendar
              </Link>
            ) : variant === "guest" ? (
              <Link
                href={tripsHref}
                className="inline-block text-sm font-semibold text-[#222222] underline"
              >
                Trip details
              </Link>
            ) : null}
          </div>
        </div>

        {booking && breakdown ? (
          <div className="border-t border-[#ebebeb] pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
              {breakdownTitle}
            </h3>
            <div className="mt-3 space-y-2">
              {nightlyAvg != null ? (
                <SidebarLine
                  label={`${breakdown.nights} nights × ${formatMoney(nightlyAvg, breakdown.currency)}`}
                  value={formatMoney(breakdown.subtotal_cents, breakdown.currency)}
                />
              ) : (
                <SidebarLine
                  label="Subtotal"
                  value={formatMoney(
                    booking.subtotal_cents ?? booking.total_cents,
                    booking.currency,
                  )}
                />
              )}
              {breakdown.length_of_stay_discount_cents > 0 ? (
                <SidebarLine
                  label="Long stay discount"
                  value={`−${formatMoney(breakdown.length_of_stay_discount_cents, breakdown.currency)}`}
                  muted
                />
              ) : null}
              {breakdown.fees.map((f) => (
                <SidebarLine
                  key={`${f.kind}-${f.label}`}
                  label={f.label}
                  value={
                    f.amount_cents >= 0
                      ? formatMoney(f.amount_cents, breakdown.currency)
                      : `−${formatMoney(Math.abs(f.amount_cents), breakdown.currency)}`
                  }
                  muted
                />
              ))}
              {breakdown.taxes_total_cents > 0 ? (
                <SidebarLine
                  label="Taxes"
                  value={formatMoney(breakdown.taxes_total_cents, breakdown.currency)}
                  muted
                />
              ) : null}
              {(booking.credit_applied_cents ?? 0) > 0 ? (
                <SidebarLine
                  label="Credits applied"
                  value={`−${formatMoney(booking.credit_applied_cents ?? 0, booking.currency)}`}
                  muted
                />
              ) : null}
              {(booking.promo_discount_cents ?? 0) > 0 ? (
                <SidebarLine
                  label="Promo discount"
                  value={`−${formatMoney(booking.promo_discount_cents ?? 0, booking.currency)}`}
                  muted
                />
              ) : null}
              <div className="flex justify-between border-t border-[#ebebeb] pt-3 text-sm font-semibold">
                <span className="text-[#222222]">Total ({booking.currency})</span>
                <span>{formatMoney(booking.total_cents, booking.currency)}</span>
              </div>
            </div>
          </div>
        ) : booking ? (
          <div className="border-t border-[#ebebeb] pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
              Trip total
            </h3>
            <p className="mt-2 text-lg font-semibold text-[#222222]">
              {formatMoney(booking.total_cents, booking.currency)}
            </p>
          </div>
        ) : null}

        {listingRow?.slug ? (
          <Link
            href={`/listings/${listingRow.slug}`}
            className="block text-sm font-semibold text-[#222222] underline"
          >
            View listing
          </Link>
        ) : null}

        
      </div>

      <div className="mt-auto border-t border-[#ebebeb] px-4 py-4">
        {variant === "admin" ? (
          <Link
            href="/admin/bookings"
            className="text-sm font-semibold text-[#222222] underline"
          >
            All reservations
          </Link>
        ) : variant === "guest" ? (
          <Link href="/account/trips" className="text-sm font-semibold text-[#222222] underline">
            All trips
          </Link>
        ) : (
          <Link href="/admin/users" className="text-sm font-semibold text-[#222222] underline">
            User directory
          </Link>
        )}
      </div>
    </div>
  );
}

function inboxUnreadCount(
  viewer: MessagingInboxVariant,
  c: InboxConversation,
): number {
  if (viewer === "admin") return c.admin_unread_count ?? 0;
  if (viewer === "guest") return c.guest_unread_count ?? 0;
  return (c.guest_unread_count ?? 0) + (c.admin_unread_count ?? 0);
}

export function MessagingInboxShell({
  variant,
  basePath,
  selectedConversationId = null,
}: {
  variant: MessagingInboxVariant;
  basePath: string;
  selectedConversationId?: string | null;
}) {
  const router = useRouter();
  const { user } = useSupabaseSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");

  const refreshConversationBooking = () => {
    void queryClient.invalidateQueries({
      queryKey: ["conversation-detail", selectedConversationId, variant],
    });
    void queryClient.invalidateQueries({ queryKey: ["conversations-inbox", variant] });
    void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["trips"] });
  };

  const handleConversationMarkedRead = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["conversations-inbox", variant] });
    void queryClient.invalidateQueries({
      queryKey: ["conversation-detail", selectedConversationId, variant],
    });
  }, [queryClient, variant, selectedConversationId]);

  const refreshInboxList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["conversations-inbox", variant] });
    if (selectedConversationId) {
      void queryClient.invalidateQueries({
        queryKey: ["conversation-detail", selectedConversationId, variant],
      });
    }
  }, [queryClient, variant, selectedConversationId]);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`inbox:${variant}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          ...(variant === "guest" ? { filter: `guest_id=eq.${user.id}` } : {}),
        },
        () => {
          refreshInboxList();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, variant, refreshInboxList]);

  const { data: listData } = useQuery({
    queryKey: ["conversations-inbox", variant],
    queryFn: async () => {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("conversations");
      return res.json() as Promise<{ conversations: InboxConversation[] }>;
    },
  });

  const { data: detailData } = useQuery({
    queryKey: ["conversation-detail", selectedConversationId, variant],
    queryFn: async () => {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(selectedConversationId ?? "")}/detail`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("detail");
      return res.json() as Promise<{
        conversation: InboxConversation & {
          booking?: BookingDetail | null;
          listing?: ListingEmbed | ListingEmbed[] | null;
        };
      }>;
    },
    enabled: Boolean(selectedConversationId),
  });

  const rows = listData?.conversations ?? [];

  const filteredRows = useMemo(() => {
    return rows.filter((c) => {
      if (filter === "unread" && inboxUnreadCount(variant, c) <= 0) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const guestName = c.guest?.display_name?.toLowerCase() ?? "";
      const adminName = c.admin?.display_name?.toLowerCase() ?? "";
      const prev = (c.last_message_preview ?? "").toLowerCase();
      const sub = (c.subject ?? "").toLowerCase();
      return (
        guestName.includes(q) ||
        adminName.includes(q) ||
        prev.includes(q) ||
        sub.includes(q)
      );
    });
  }, [rows, filter, query, variant]);

  const activeDetail = detailData?.conversation;
  const rowMatch = rows.find(
    (r) =>
      r.id === selectedConversationId ||
      (r.booking?.code && r.booking.code === selectedConversationId),
  );
  const detailGuest = activeDetail?.guest ?? rowMatch?.guest ?? null;
  const detailAdmin = activeDetail?.admin ?? rowMatch?.admin ?? null;
  const detailBooking = activeDetail?.booking ?? rowMatch?.booking ?? null;
  const detailListing =
    normalizeListing(activeDetail?.listing) ??
    normalizeListing(detailBooking?.listings);
  const activePublicConversationId = activeDetail
    ? conversationPublicIdentifier(activeDetail)
    : rowMatch
      ? conversationPublicIdentifier(rowMatch)
      : selectedConversationId;
  const realtimeConversationId =
    activeDetail?.id ?? rowMatch?.id ?? selectedConversationId;

  useEffect(() => {
    if (!selectedConversationId || !activeDetail?.booking?.code) return;
    const canonicalId = conversationPublicIdentifier(activeDetail);
    if (canonicalId === selectedConversationId) return;
    router.replace(`${basePath}/${encodeURIComponent(canonicalId)}`);
  }, [activeDetail, basePath, router, selectedConversationId]);

  const peerName =
    variant === "admin"
      ? (detailGuest?.display_name ?? "Guest")
      : variant === "guest"
        ? (detailAdmin?.display_name ?? "Onalani")
        : [
            detailGuest?.display_name ?? "Guest",
            detailAdmin?.display_name ?? "Admin",
          ].join(" · ");

  const headerHighlight = conversationHighlight(
    detailBooking,
    activeDetail?.last_message_preview ?? rowMatch?.last_message_preview ?? null,
  );

  const headerStayHint = detailBooking
    ? staySnippetFromBookingListing(detailBooking)
    : null;

  const showSidebar =
    variant === "admin"
      ? Boolean(detailGuest || detailAdmin)
      : variant === "guest"
        ? Boolean(detailAdmin || detailBooking)
        : Boolean(detailGuest);

  if (!user?.id) {
    return <p className="text-sm text-muted-foreground">Sign in required.</p>;
  }

  return (
    <div className="inbox-shell flex h-full min-h-0 flex-col overflow-hidden bg-white lg:flex-row">
      {/* Thread list */}
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-[#ebebeb] lg:w-[min(100%,320px)] lg:border-r",
          selectedConversationId ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between border-b border-[#ebebeb] px-4 py-3">
          <h1 className="text-lg font-semibold text-[#222222]">Messages</h1>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="text-[#222222]">
              <Search className="h-5 w-5" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-[#222222]">
              <Settings className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-[#ebebeb] px-4 py-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              filter === "all"
                ? "bg-[#a8d4e6] text-white"
                : "bg-white text-[#222222] ring-1 ring-[#dddddd]",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              filter === "unread"
                ? "bg-[#a8d4e6] text-white"
                : "bg-white text-[#222222] ring-1 ring-[#dddddd]",
            )}
          >
            Unread
          </button>
        </div>

        <div className="border-b border-[#ebebeb] px-4 py-2">
          <Input
            placeholder="Search name or message"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 rounded-full border-[#dcdcdc] bg-white text-sm"
          />
        </div>

        <div className="scrollbar-inbox min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {filteredRows.map((c) => {
            const peerProfile =
              variant === "admin"
                ? c.guest
                : variant === "guest"
                  ? c.admin
                  : c.guest;
            const threadTitle =
              variant === "admin"
                ? [
                    c.guest?.display_name ?? "Guest",
                    c.admin?.display_name ?? "Onalani",
                  ].join(" · ")
                : variant === "guest"
                  ? (peerProfile?.display_name ?? "Onalani")
                  : (peerProfile?.display_name ??
                    c.subject ??
                    "Guest");
            const unread = inboxUnreadCount(variant, c) > 0;
            const publicConversationId = conversationPublicIdentifier(c);
            const selected =
              c.id === selectedConversationId ||
              publicConversationId === selectedConversationId;
            const booking = c.booking;
            const stayHint = booking ? staySnippetFromBookingListing(booking) : null;
            const highlight = conversationHighlight(
              booking,
              c.last_message_preview,
            );
            const avatar = inboxPeerAvatar(variant, peerProfile, booking, c.listing);

            return (
              <Link
                key={c.id}
                href={`${basePath}/${publicConversationId}`}
                className={cn(
                  "flex gap-3 border-b border-[#f1f1f1] px-4 py-3 transition",
                  statusRowAccentClass(highlight),
                  unread
                    ? "bg-[#e8f4fc] hover:bg-[#dceef9]"
                    : "bg-white hover:bg-[#fafafa]",
                  selected &&
                    (unread ? "ring-1 ring-inset ring-[#a8d4e6]/55" : "bg-[#f5f5f5]"),
                )}
                aria-current={selected ? "page" : undefined}
              >
                <Avatar className="h-12 w-12 shrink-0 border border-[#ebebeb]">
                  <AvatarImage src={avatar.imageSrc} alt="" />
                  <AvatarFallback
                    className={cn("text-sm font-semibold", avatar.fallbackClassName)}
                  >
                    {avatar.fallback}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold text-[#222222]",
                        unread && "font-bold",
                      )}
                    >
                      {threadTitle}
                    </p>
                    <span className="shrink-0 text-xs text-[#717171]">
                      {c.last_message_at
                        ? formatDistanceToNow(new Date(c.last_message_at), {
                            addSuffix: false,
                          })
                        : ""}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] leading-snug">
                    {booking ? (
                      <>
                        <span className="rounded-md bg-[#ececec] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#222222]">
                          #{booking.code}
                        </span>
                        <span className={statusHighlightClass(highlight)}>
                          {highlight === "change_request"
                            ? "Change request"
                            : bookingStatusLabel(booking.status)}
                          {" · "}
                          {formatStayRange(booking.check_in, booking.check_out)}
                          {stayHint ? ` · ${stayHint}` : ""}
                        </span>
                      </>
                    ) : c.listing_id || c.subject?.toLowerCase().includes("inquiry") ? (
                      <span className="font-medium text-[#b45309]">
                        Listing inquiry
                        {inquirySnippet(c.listing) ? ` · ${inquirySnippet(c.listing)}` : ""}
                        {" · "}no reservation yet
                      </span>
                    ) : (
                      <span className="text-[#717171]">General message</span>
                    )}
                  </p>
                  <p
                    className={cn(
                      "mt-1 line-clamp-2 text-sm text-[#717171]",
                      unread && "font-medium text-[#222222]",
                    )}
                  >
                    {c.last_message_preview ?? "No messages yet"}
                  </p>
                </div>
                {unread ? (
                  <span
                    className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#FF385C]"
                    title="Unread"
                    aria-label="Unread messages"
                  />
                ) : null}
              </Link>
            );
          })}
          {filteredRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#717171]">
              No conversations match.
            </p>
          ) : null}
        </div>
      </aside>

      {/* Chat + reservation */}
      <section
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          !selectedConversationId && "hidden lg:flex",
        )}
      >
        {selectedConversationId ? (
          <>
            <div className="flex items-center gap-2 border-b border-[#ebebeb] px-4 py-3 lg:px-5">
              <Link
                href={basePath}
                className="mr-1 rounded-full p-2 hover:bg-white lg:hidden"
                aria-label="Back to inbox"
              >
                <ChevronLeft className="h-5 w-5 text-[#222222]" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-[#222222]">
                  {peerName}
                </p>
                <p className="text-xs text-[#717171]">Translation off</p>
                {detailBooking ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#717171]">
                    <span className="font-mono text-[11px] font-semibold text-[#222222]">
                      #{detailBooking.code}
                    </span>
                    <span>{formatStayRange(detailBooking.check_in, detailBooking.check_out)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        headerHighlight === "confirmed" &&
                          "bg-emerald-50 text-emerald-800",
                        headerHighlight === "request" && "bg-amber-50 text-amber-800",
                        headerHighlight === "change_request" &&
                          "bg-violet-50 text-violet-800",
                        headerHighlight === "cancelled" &&
                          "bg-[#ececec] text-[#444444]",
                        headerHighlight === "default" &&
                          "bg-[#ececec] text-[#444444]",
                      )}
                    >
                      {headerHighlight === "change_request"
                        ? "Change request"
                        : bookingStatusLabel(detailBooking.status)}
                    </span>
                    {headerStayHint ? (
                      <span className="max-w-full truncate">{headerStayHint}</span>
                    ) : null}
                  </p>
                ) : variant !== "admin" ? (
                  <p className="mt-1.5 text-xs font-medium text-[#b45309]">
                    Listing inquiry · not tied to a reservation
                  </p>
                ) : selectedConversationId ? (
                  <p className="mt-1.5 text-xs text-[#717171]">
                    No booking linked to this thread
                  </p>
                ) : null}
              </div>
              {variant === "admin" ? (
                <AdminDeleteConversationButton
                  conversationId={activePublicConversationId ?? selectedConversationId}
                  bookingId={detailBooking?.id ?? rowMatch?.booking_id ?? null}
                  basePath={basePath}
                  onDeleted={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["conversations-inbox", variant],
                    });
                  }}
                />
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <MessageThread
                  conversationId={activePublicConversationId ?? selectedConversationId}
                  realtimeConversationId={realtimeConversationId}
                  currentUserId={user.id}
                  variant="adminInbox"
                  viewerVariant={variant}
                  guestProfile={
                    detailGuest
                      ? {
                          id: detailGuest.id,
                          display_name: detailGuest.display_name,
                          avatar_url: detailGuest.avatar_url,
                        }
                      : null
                  }
                  adminProfile={
                    detailAdmin
                      ? {
                          id: detailAdmin.id,
                          display_name: detailAdmin.display_name,
                          avatar_url: detailAdmin.avatar_url,
                        }
                      : null
                  }
                  bookingId={detailBooking?.code ?? null}
                  className="h-full min-h-0 flex-1"
                  onMarkedRead={handleConversationMarkedRead}
                  prepend={
                    detailBooking ? (
                      <ThreadContextCard
                        viewerVariant={variant}
                        booking={detailBooking}
                        listing={
                          normalizeListing(detailBooking.listings) ?? detailListing
                        }
                      />
                    ) : detailListing ? (
                      <div className="rounded-xl border border-[#dddddd] bg-[#fafafa] p-3 text-sm text-[#222222]">
                        <p className="font-semibold">About this listing</p>
                        <p className="mt-1 text-[#717171]">
                          {detailListing.properties?.property_name ??
                            detailListing.unit_type ??
                            "Listing inquiry"}
                        </p>
                        <p className="mt-2 line-clamp-3 text-xs text-[#717171]">
                          {detailListing.unit_description ?? ""}
                        </p>
                      </div>
                    ) : null
                  }
                />
              </div>

              {showSidebar ? (
                <div className="hidden min-h-0 w-full shrink-0 lg:flex lg:w-[min(100%,360px)] lg:flex-col lg:overflow-hidden lg:border-l lg:border-[#ebebeb]">
                  <ReservationSidebar
                    variant={variant}
                    guest={detailGuest}
                    staffProfile={detailAdmin}
                    booking={detailBooking}
                    listing={detailListing}
                    conversationId={selectedConversationId}
                    onBookingMutated={refreshConversationBooking}
                  />
                </div>
              ) : null}
            </div>

            {/* Mobile reservation summary */}
            {showSidebar ? (
              <div className="border-t border-[#ebebeb] lg:hidden">
                <ReservationSidebar
                  variant={variant}
                  guest={detailGuest}
                  staffProfile={detailAdmin}
                  booking={detailBooking}
                  listing={detailListing}
                  conversationId={selectedConversationId}
                  onBookingMutated={refreshConversationBooking}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center px-6 py-16 text-center lg:flex">
            <p className="text-lg font-semibold text-[#222222]">
              Select a conversation
            </p>
            <p className="mt-2 max-w-sm text-sm text-[#717171]">
              {variant === "admin"
                ? "Choose a guest thread on the left to view messages, guest details, and reservation information."
                : variant === "guest"
                  ? "Pick a conversation with Onalani support to see messages and trip details."
                  : "Open a thread to review messages between guests and the team."}
            </p>
          </div>
        )}
      </section>

    </div>
  );
}
