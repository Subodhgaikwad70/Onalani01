const CANCELLED_STATUSES = new Set([
  "cancelled_by_guest",
  "cancelled_by_admin",
]);

const TERMINAL_STATUSES = new Set([
  ...CANCELLED_STATUSES,
  "completed",
  "declined",
  "expired",
]);

export function isBookingCancelled(status: string): boolean {
  return CANCELLED_STATUSES.has(status);
}

export function isBookingTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function formatBookingStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
