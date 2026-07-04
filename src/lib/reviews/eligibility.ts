export const REVIEW_WINDOW_DAYS = 14;

const NON_REVIEWABLE_STATUSES = new Set([
  "cancelled_by_guest",
  "cancelled_by_admin",
  "declined",
  "expired",
  "pending_payment",
  "requested",
]);

export function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True once the guest's checkout date has arrived or passed (UTC calendar day). */
export function isCheckoutPassed(checkOut: string, today = todayIsoUtc()): boolean {
  return today >= checkOut;
}

export function reviewWindowDeadline(checkOut: string): string {
  const deadline = new Date(`${checkOut}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + REVIEW_WINDOW_DAYS);
  return deadline.toISOString().slice(0, 10);
}

export function isReviewWindowOpen(checkOut: string, today = todayIsoUtc()): boolean {
  if (!isCheckoutPassed(checkOut, today)) return false;
  return today <= reviewWindowDeadline(checkOut);
}

export function canGuestReviewListing(
  booking: { status: string; check_out: string },
  opts?: { hasExistingReview?: boolean; today?: string },
): boolean {
  if (opts?.hasExistingReview) return false;
  if (NON_REVIEWABLE_STATUSES.has(booking.status)) return false;
  return isReviewWindowOpen(booking.check_out, opts?.today);
}
