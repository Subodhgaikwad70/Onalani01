export type GuestCreditGrant = {
  id: string;
  original_cents: number;
  remaining_cents: number;
  currency: string;
  expires_at: string | null;
  status: string;
  credit_lots?: { name: string | null } | null;
};

export type GuestCreditHistoryEntry = {
  id: string;
  type: "applied" | "refunded";
  amount_cents: number;
  currency: string;
  created_at: string;
  booking_id: string | null;
  booking_code: string | null;
  booking_label: string | null;
  grant_label: string | null;
};

export type GuestCreditsResponse = {
  balances: Record<string, number>;
  grants: GuestCreditGrant[];
  history: GuestCreditHistoryEntry[];
  history_page?: number;
  history_limit?: number;
  history_total?: number;
  history_total_pages?: number;
};

export function grantLabel(grant: {
  credit_lots?: { name: string | null } | null;
}): string {
  return grant.credit_lots?.name?.trim() || "Credit";
}

export function grantUsedCents(grant: {
  original_cents: number;
  remaining_cents: number;
}): number {
  return Math.max(0, grant.original_cents - grant.remaining_cents);
}

export function grantRemainingPct(grant: {
  original_cents: number;
  remaining_cents: number;
}): number {
  if (grant.original_cents <= 0) return 0;
  return Math.min(100, Math.round((grant.remaining_cents / grant.original_cents) * 100));
}

type ListingEmbed = {
  unit_type?: string | null;
  properties?: { property_name?: string | null } | null;
};

export function bookingLabelFromEmbed(
  booking: {
    code?: string;
    listings?: ListingEmbed | ListingEmbed[] | null;
  } | null,
): string | null {
  if (!booking) return null;
  const raw = booking.listings;
  const L = Array.isArray(raw) ? raw[0] : raw;
  const prop = L?.properties?.property_name?.trim();
  const unit = L?.unit_type?.trim();
  if (prop && unit) return `${prop}: ${unit}`;
  if (prop) return prop;
  if (unit) return unit;
  return booking.code ? `Reservation ${booking.code}` : null;
}

export function mergeCreditHistory(
  applied: GuestCreditHistoryEntry[],
  refunded: GuestCreditHistoryEntry[],
): GuestCreditHistoryEntry[] {
  return [...applied, ...refunded].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
