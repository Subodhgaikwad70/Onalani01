/**
 * Onalani cancellation tier definitions — display copy and pricing modifiers.
 */

export type CancellationPolicyKey =
  | "firm"
  | "super_strict"
  | "non_refundable";

export const DEFAULT_CANCELLATION_POLICY_KEY: CancellationPolicyKey =
  "super_strict";

/** Pre-selected tier in guest checkout (Airbnb-style: cheapest rate). */
export const GUEST_CHECKOUT_DEFAULT_POLICY_KEY: CancellationPolicyKey =
  "non_refundable";

/** Firm nightly accommodation is 7.5% above Super Strict (midpoint of 5–10%). */
export const FIRM_RATE_MARKUP_PCT = 7.5;

/** Non-refundable is 10% below Super Strict base (Airbnb-style discount). */
export const NON_REFUNDABLE_DISCOUNT_PCT = 10;

/** Subtotal multipliers relative to listing base (Super Strict). */
export const POLICY_PRICE_MULTIPLIERS: Record<CancellationPolicyKey, number> = {
  non_refundable: 1 - NON_REFUNDABLE_DISCOUNT_PCT / 100,
  super_strict: 1,
  firm: 1 + FIRM_RATE_MARKUP_PCT / 100,
};

/** Guest-facing rate picker order (cheapest first, like Airbnb). */
export const GUEST_RATE_OPTIONS_ORDER: CancellationPolicyKey[] = [
  "non_refundable",
  "super_strict",
  "firm",
];

/** Short copy shown under each rate row at booking (Airbnb-style). */
export const GUEST_RATE_BOOKING_BLURB: Record<CancellationPolicyKey, string> = {
  non_refundable:
    "No cash refunds. Cancel 45+ days before check-in for at least 15% in travel credits. Under 45 days, recovery-based credits only if your dates rebook.",
  super_strict:
    "Lower rate. Full cash refund minus 3% fee if you cancel 90+ days before check-in. 50% cash at 60–89 days; credits may apply closer to arrival.",
  firm:
    "Higher rate for flexibility. Full cash refund minus 3% fee if you cancel 30+ days before check-in. 50% cash plus credits at 10–29 days out.",
};

export type CancellationRateOption = {
  key: CancellationPolicyKey;
  label: string;
  total_cents: number;
  summary: string;
};

export type PolicyTierDisplay = {
  windowLabel: string;
  cashRefund: string;
  creditIssued: string;
  howItWorks: string;
};

export type CancellationPolicyDisplay = {
  key: CancellationPolicyKey;
  label: string;
  tagline: string;
  tiers: PolicyTierDisplay[];
};

export const CANCELLATION_POLICY_DISPLAY: Record<
  CancellationPolicyKey,
  CancellationPolicyDisplay
> = {
  firm: {
    key: "firm",
    label: "Firm",
    tagline:
      "Nightly rate is 5–10% higher than Super Strict. You are purchasing cancellation flexibility as part of the product.",
    tiers: [
      {
        windowLabel: "30+ days before check-in",
        cashRefund: "100%",
        creditIssued: "None needed",
        howItWorks:
          "Full cash refund minus 3% processing fee. Clean exit.",
      },
      {
        windowLabel: "29 – 10 days",
        cashRefund: "50%",
        creditIssued: "Recovery-based (up to 50% credits)",
        howItWorks:
          "Majority back in cash plus credits for the remainder if dates rebook.",
      },
      {
        windowLabel: "Under 10 days",
        cashRefund: "None",
        creditIssued: "Recovery-based (up to 100% credits)",
        howItWorks:
          "No cash refund. Up to full booking value as credits if dates rebook.",
      },
    ],
  },
  super_strict: {
    key: "super_strict",
    label: "Super Strict",
    tagline:
      "Lower nightly rate. You accept reduced flexibility in exchange for savings upfront.",
    tiers: [
      {
        windowLabel: "90+ days before check-in",
        cashRefund: "100%",
        creditIssued: "None needed",
        howItWorks: "Full cash refund minus 3% processing fee.",
      },
      {
        windowLabel: "60 – 89 days",
        cashRefund: "50%",
        creditIssued: "Recovery-based + 25% guaranteed minimum",
        howItWorks:
          "Lower cash return than Firm. Credits partially compensate.",
      },
      {
        windowLabel: "30 – 59 days",
        cashRefund: "None",
        creditIssued: "Recovery-based + 15% guaranteed minimum",
        howItWorks:
          "Credits = max(15% of booking, recovery %). You never get zero.",
      },
      {
        windowLabel: "Under 29 days",
        cashRefund: "None",
        creditIssued: "Recovery-based only (no minimum)",
        howItWorks:
          "No cash. Half the booking value may be preserved as credits if dates rebook.",
      },
    ],
  },
  non_refundable: {
    key: "non_refundable",
    label: "Non-refundable",
    tagline:
      "Lowest nightly rate. No cash refunds. You receive at least 15% in travel credits if you cancel 45+ days before check-in; otherwise credits are recovery-based only.",
    tiers: [
      {
        windowLabel: "45+ days before check-in",
        cashRefund: "None",
        creditIssued: "15% minimum credits",
        howItWorks:
          "No cash refund. At least 15% of the booking value issued as travel credits when you cancel.",
      },
      {
        windowLabel: "Under 45 days",
        cashRefund: "None",
        creditIssued: "Recovery-based only",
        howItWorks:
          "No cash refund and no guaranteed credits. Credits issued only if your cancelled dates are rebooked.",
      },
    ],
  },
};

export function isCancellationPolicyKey(
  key: string | null | undefined,
): key is CancellationPolicyKey {
  return (
    key === "firm" || key === "super_strict" || key === "non_refundable"
  );
}

export function getCancellationPolicyDisplay(
  key: string | null | undefined,
): CancellationPolicyDisplay {
  if (isCancellationPolicyKey(key)) {
    return CANCELLATION_POLICY_DISPLAY[key];
  }
  return CANCELLATION_POLICY_DISPLAY[DEFAULT_CANCELLATION_POLICY_KEY];
}

/** Apply policy multiplier to accommodation subtotal. */
export function applyPolicyPricingMarkup(
  subtotalCents: number,
  policyKey: string | null | undefined,
): number {
  if (subtotalCents <= 0 || !isCancellationPolicyKey(policyKey)) {
    return subtotalCents;
  }
  return Math.round(subtotalCents * POLICY_PRICE_MULTIPLIERS[policyKey]);
}

/** Recompute quote totals for a guest-selected cancellation tier. */
export function applyCancellationPolicyToBreakdown<
  T extends {
    subtotal_cents: number;
    taxes: { jurisdiction: string; kind: string; amount_cents: number }[];
    taxes_total_cents: number;
    fees_total_cents: number;
    total_cents: number;
    length_of_stay_discount_cents?: number;
  },
>(breakdown: T, policyKey: string | null | undefined): T {
  if (!isCancellationPolicyKey(policyKey)) return breakdown;

  const oldSubtotal = breakdown.subtotal_cents;
  const newSubtotal = applyPolicyPricingMarkup(oldSubtotal, policyKey);
  if (newSubtotal === oldSubtotal) return breakdown;

  const ratio = oldSubtotal > 0 ? newSubtotal / oldSubtotal : 1;
  const newTaxes = breakdown.taxes.map((t) => ({
    ...t,
    amount_cents: Math.round(t.amount_cents * ratio),
  }));
  const taxesTotal = newTaxes.reduce((s, t) => s + t.amount_cents, 0);

  return {
    ...breakdown,
    subtotal_cents: newSubtotal,
    taxes: newTaxes,
    taxes_total_cents: taxesTotal,
    total_cents:
      newSubtotal +
      breakdown.fees_total_cents +
      taxesTotal -
      (breakdown.length_of_stay_discount_cents ?? 0),
  };
}

/** Build all guest-selectable rate rows from a base (Super Strict) quote. */
export function buildCancellationRateOptions<
  T extends {
    subtotal_cents: number;
    taxes: { jurisdiction: string; kind: string; amount_cents: number }[];
    taxes_total_cents: number;
    fees_total_cents: number;
    total_cents: number;
    length_of_stay_discount_cents?: number;
  },
>(baseBreakdown: T): CancellationRateOption[] {
  return GUEST_RATE_OPTIONS_ORDER.map((key) => {
    const adjusted = applyCancellationPolicyToBreakdown(baseBreakdown, key);
    return {
      key,
      label: CANCELLATION_POLICY_DISPLAY[key].label,
      total_cents: adjusted.total_cents,
      summary: GUEST_RATE_BOOKING_BLURB[key],
    };
  });
}

export function formatDaysBeforeCheckIn(hoursToCheckIn: number): string {
  const days = Math.floor(hoursToCheckIn / 24);
  if (days >= 90) return `${days} days`;
  if (days >= 30) return `${days} days`;
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  return "Less than 1 day";
}
