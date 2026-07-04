export type PaymentHistoryEntry = {
  id: string;
  kind: string;
  amount_cents: number;
  currency: string;
  stripe_object_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  charge: "Payment",
  refund: "Refund",
  credit_redemption: "Credits applied",
  credit_refund: "Credits returned",
  promo_discount: "Promo discount",
  platform_fee: "Service fee",
};

export function paymentHistoryKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

/** Guest-facing display amount (always positive for refunds/credits returned). */
export function paymentHistoryDisplayCents(entry: PaymentHistoryEntry): number {
  if (entry.kind === "refund" || entry.kind === "credit_refund") {
    return Math.abs(entry.amount_cents);
  }
  return entry.amount_cents;
}

export function paymentHistoryIsCredit(entry: PaymentHistoryEntry): boolean {
  return (
    entry.kind === "credit_redemption" ||
    entry.kind === "credit_refund" ||
    entry.kind === "promo_discount"
  );
}
