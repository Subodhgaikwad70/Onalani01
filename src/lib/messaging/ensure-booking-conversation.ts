import { apiPost } from "@/lib/api/client";

/** Returns (and creates if needed) the conversation for this booking — one thread per reservation. */
export async function ensureBookingConversation(bookingId: string): Promise<string> {
  const data = await apiPost<{ conversation: { id: string; public_id?: string } }>("/api/conversations", {
    booking_id: bookingId,
  });
  return data.conversation.public_id ?? data.conversation.id;
}
