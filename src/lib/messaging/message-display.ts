/** Detect automated booking/status lines in a thread. */
export function isSystemMessage(message: {
  is_system?: boolean;
  body: string;
}): boolean {
  if (message.is_system) return true;
  const head = message.body.trim().split("\n")[0] ?? "";
  return /^\[(Booking |Payment |Request )/.test(head);
}

type SystemFormatContext = {
  senderName?: string | null;
};

/**
 * Airbnb-style one-line copy for status messages (centered, small, no bubble).
 */
export function formatSystemMessageLine(
  body: string,
  context?: SystemFormatContext,
): string {
  const trimmed = body.trim();
  const firstLine = trimmed.split("\n")[0] ?? trimmed;
  const guestName = context?.senderName?.trim() || "Guest";

  const cancelled = trimmed.match(
    /^\[Booking cancelled\]\s+\S+\s+—\s+reservation for (.+) was cancelled\./,
  );
  if (cancelled) {
    return `${guestName} cancelled this reservation.`;
  }

  const declined = trimmed.match(
    /^\[Request declined\]\s+\S+\s+—\s+the stay request for (.+) was declined\./,
  );
  if (declined) {
    return `The stay request for ${declined[1]} was declined.`;
  }

  const confirmed = trimmed.match(
    /Stay confirmed for (.+?)\.\s*$/m,
  );
  if (firstLine.startsWith("[Booking confirmed]") && confirmed) {
    return `Booking confirmed · ${confirmed[1]}`;
  }

  const pending = trimmed.match(
    /Instant book for (.+?)\.\s*$/m,
  );
  if (firstLine.startsWith("[Payment pending]") && pending) {
    return `Payment pending · ${pending[1]}`;
  }

  const requested = trimmed.match(
    /Guest submitted a stay request for (.+?)\.\s*$/m,
  );
  if (firstLine.startsWith("[Booking request]") && requested) {
    return `Booking request · ${requested[1]}`;
  }

  const update = trimmed.match(
    /^\[Booking update\]\s+\S+\s+—\s+status is now (.+)\./,
  );
  if (update) {
    return `Reservation updated · ${update[1]}`;
  }

  return firstLine.replace(/^\[[^\]]+\]\s*\S+\s*[—–-]?\s*/, "").trim() || firstLine;
}
