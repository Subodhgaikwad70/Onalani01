const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONFIRMATION_CODE_RE = /^ONA\d{8}$/;

export type BookingIdentifierLookup = {
  column: "id" | "code";
  value: string;
};

export function normalizeBookingCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isOnalaniConfirmationCode(value: string): boolean {
  return CONFIRMATION_CODE_RE.test(normalizeBookingCode(value));
}

export function bookingIdentifierLookup(
  identifier: string,
): BookingIdentifierLookup {
  const value = identifier.trim();
  if (isUuid(value)) return { column: "id", value };
  return { column: "code", value: normalizeBookingCode(value) };
}

export function bookingPublicIdentifier(booking: {
  id: string;
  code?: string | null;
}): string {
  return booking.code?.trim() || booking.id;
}
