import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/format";

export type BookingInboxEvent =
  | "requested"
  | "pending_payment"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "change_requested"
  | "change_approved"
  | "change_declined";

type BookingRow = {
  id: string;
  code: string;
  guest_id: string;
  listing_id: string;
  status: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  total_cents: number;
  currency: string;
  guest_notes: string | null;
};

function formatStayRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

function guestCountLine(booking: BookingRow): string {
  const parts = [
    `${booking.adults} adult${booking.adults === 1 ? "" : "s"}`,
    booking.children > 0
      ? `${booking.children} child${booking.children === 1 ? "" : "ren"}`
      : null,
    booking.infants > 0
      ? `${booking.infants} infant${booking.infants === 1 ? "" : "s"}`
      : null,
    booking.pets > 0 ? `${booking.pets} pet${booking.pets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

function inboxMessageForEvent(
  booking: BookingRow,
  event: BookingInboxEvent,
): { body: string; dedupePrefix: string } {
  const dates = formatStayRange(booking.check_in, booking.check_out);
  const guests = guestCountLine(booking);
  const total = formatMoney(booking.total_cents, booking.currency);
  const notes = booking.guest_notes?.trim();

  switch (event) {
    case "requested":
      return {
        dedupePrefix: `[Booking request] ${booking.code}`,
        body: [
          `[Booking request] ${booking.code}`,
          `Guest submitted a stay request for ${dates} (${guests}).`,
          `Estimated total: ${total}.`,
          notes ? `Guest note: ${notes}` : null,
          "Awaiting admin review.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "pending_payment":
      return {
        dedupePrefix: `[Payment pending] ${booking.code}`,
        body: [
          `[Payment pending] ${booking.code}`,
          `Instant book for ${dates} (${guests}).`,
          `Total due: ${total}.`,
          notes ? `Guest note: ${notes}` : null,
          "Guest needs to complete payment to confirm.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "confirmed":
      return {
        dedupePrefix: `[Booking confirmed] ${booking.code}`,
        body: [
          `[Booking confirmed] ${booking.code}`,
          `Stay confirmed for ${dates} (${guests}).`,
          `Total: ${total}.`,
        ].join("\n"),
      };
    case "declined":
      return {
        dedupePrefix: `[Request declined] ${booking.code}`,
        body: `[Request declined] ${booking.code} — the stay request for ${dates} was declined.`,
      };
    case "cancelled":
      return {
        dedupePrefix: `[Booking cancelled] ${booking.code}`,
        body: `[Booking cancelled] ${booking.code} — reservation for ${dates} was cancelled.`,
      };
    case "change_requested":
      return {
        dedupePrefix: `[Change request] ${booking.code}`,
        body: `[Change request] ${booking.code} — guest or staff proposed new trip details for ${dates} (${guests}). Review and approve in Reservations.`,
      };
    case "change_approved":
      return {
        dedupePrefix: `[Change approved] ${booking.code}`,
        body: `[Change approved] ${booking.code} — updated stay is now ${dates} (${guests}). Total: ${total}.`,
      };
    case "change_declined":
      return {
        dedupePrefix: `[Change declined] ${booking.code}`,
        body: `[Change declined] ${booking.code} — a proposed change to ${dates} was not applied.`,
      };
    default:
      return {
        dedupePrefix: `[Booking update] ${booking.code}`,
        body: `[Booking update] ${booking.code} — status is now ${booking.status.replace(/_/g, " ")}.`,
      };
  }
}

async function loadBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<BookingRow | null> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, code, guest_id, listing_id, status, check_in, check_out, adults, children, infants, pets, total_cents, currency, guest_notes",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BookingRow | null;
}

async function ensureConversation(
  admin: SupabaseClient,
  booking: BookingRow,
): Promise<string> {
  const { data: existing, error: lookupError } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = await admin
    .from("conversations")
    .insert({
      guest_id: booking.guest_id,
      admin_id: null,
      listing_id: booking.listing_id,
      booking_id: booking.id,
      subject: `Reservation ${booking.code}`,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created.id as string;
}

async function hasDuplicateMessage(
  admin: SupabaseClient,
  conversationId: string,
  dedupePrefix: string,
): Promise<boolean> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .like("body", `${dedupePrefix}%`)
    .limit(1);
  return Boolean(data?.length);
}

/**
 * Ensures a booking thread exists in the admin inbox and posts a status line
 * so staff see new requests, payments, and confirmations without opening Trips.
 */
export async function syncBookingToAdminInbox(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    event: BookingInboxEvent;
  },
): Promise<string | null> {
  try {
    const booking = await loadBooking(admin, input.bookingId);
    if (!booking) return null;

    const conversationId = await ensureConversation(admin, booking);
    const { body, dedupePrefix } = inboxMessageForEvent(booking, input.event);

    if (await hasDuplicateMessage(admin, conversationId, dedupePrefix)) {
      return conversationId;
    }

    const { error: msgError } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: booking.guest_id,
      body,
      is_system: true,
    });
    if (msgError) throw new Error(msgError.message);

    return conversationId;
  } catch (e) {
    console.error("[booking-inbox]", input, e);
    return null;
  }
}
