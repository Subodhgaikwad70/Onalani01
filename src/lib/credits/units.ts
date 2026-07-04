/** 1 credit = $1 (100 cents). Credits are whole-dollar only; guest-favor rounding on earn. */

export function guestFavorCreditCents(rawCents: number): number {
  if (rawCents <= 0) return 0;
  return Math.ceil(rawCents / 100) * 100;
}

export function creditsToCents(credits: number): number {
  return Math.max(0, Math.floor(credits)) * 100;
}

export function centsToCredits(cents: number): number {
  return Math.floor(cents / 100);
}

/** Redemption uses whole credits only (round down applied amount). */
export function wholeCreditCents(cents: number): number {
  if (cents <= 0) return 0;
  return Math.floor(cents / 100) * 100;
}

export const CREDIT_EXPIRY_MONTHS = 12;
export const MAX_TRANSFERS_PER_BATCH = 5;

export function creditBatchExpiresAt(issuedAt: Date = new Date()): string {
  const d = new Date(issuedAt);
  d.setMonth(d.getMonth() + CREDIT_EXPIRY_MONTHS);
  return d.toISOString();
}
