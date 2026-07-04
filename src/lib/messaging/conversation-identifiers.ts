import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConversationReference = {
  id: string;
  booking_id: string | null;
  guest_id: string;
  admin_id: string | null;
  booking?: { code?: string | null } | null;
};

type ConversationPublicBooking =
  | { code?: string | null }
  | Array<{ code?: string | null }>
  | null
  | undefined;

const CONVERSATION_REFERENCE_SELECT = `
  id,
  booking_id,
  guest_id,
  admin_id,
  booking:bookings!conversations_booking_id_fkey(code)
`;

export function conversationPublicIdentifier(conversation: {
  id: string;
  booking?: ConversationPublicBooking;
}): string {
  const booking = Array.isArray(conversation.booking)
    ? conversation.booking[0]
    : conversation.booking;
  return booking?.code?.trim() || conversation.id;
}

export async function resolveConversationReference(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ conversation: ConversationReference | null; error?: { message: string } }> {
  const trimmed = identifier.trim();

  if (UUID_RE.test(trimmed)) {
    const { data, error } = await supabase
      .from("conversations")
      .select(CONVERSATION_REFERENCE_SELECT)
      .eq("id", trimmed)
      .maybeSingle();
    if (error) return { conversation: null, error };
    if (data) return { conversation: data as ConversationReference };
  }

  const lookup = bookingIdentifierLookup(trimmed);
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (bookingError) return { conversation: null, error: bookingError };
  if (!booking) return { conversation: null };

  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_REFERENCE_SELECT)
    .eq("booking_id", booking.id as string)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) return { conversation: null, error };
  return { conversation: (data as ConversationReference | null) ?? null };
}
