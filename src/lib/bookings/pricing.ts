/**
 * Pricing engine for booking quotes.
 *
 * Inputs (resolved upstream):
 *   - listing base price + currency + min/max nights
 *   - listing_fees (cleaning, extra_guest, pet, service, resort)
 *   - listing_pricing_rules (weekend, seasonal, length_of_stay, early_bird, last_minute)
 *   - tax_rates joined via property_tax_rates
 *   - per-day prices from price_cache (or base_price_cents fallback) — Phase 4
 *
 * Output: a structured pricing breakdown that lives in bookings.pricing_breakdown
 * and is what we render at checkout. Fee/tax names + amounts are kept verbose
 * for transparency.
 *
 * All amounts are integer cents. Currency is assumed consistent across one
 * listing (we do not mix currencies inside a single quote).
 */

export type Fee = {
  id?: string;
  kind:
    | "cleaning"
    | "extra_guest"
    | "pet"
    | "service"
    | "resort";
  amount_cents: number;
  currency: string;
  applies_per: "stay" | "night" | "guest_night";
  threshold?: number | null;
};

export type PricingRule = {
  id?: string;
  kind:
    | "weekend"
    | "seasonal"
    | "length_of_stay"
    | "early_bird"
    | "last_minute";
  config: Record<string, unknown>;
  starts_on?: string | null;
  ends_on?: string | null;
  priority?: number;
  is_active?: boolean;
};

export type TaxRate = {
  id?: string;
  jurisdiction: string;
  kind: "occupancy" | "vat" | "city" | "state" | "federal" | "service";
  rate_pct: number;
  applies_to: "subtotal" | "nightly" | "fees" | "total";
};

export type PricingInput = {
  basePriceCents: number;
  currency: string;
  checkIn: Date;
  checkOut: Date;
  guests: { adults: number; children?: number; infants?: number; pets?: number };
  fees?: Fee[];
  pricingRules?: PricingRule[];
  taxRates?: TaxRate[];
  /** Per-date overrides from price_cache (cents). Index by ISO yyyy-mm-dd. */
  perDayPriceCents?: Record<string, number>;
  /** Default occupancy bundled in the base price; extra_guest fee triggers above this. */
  baseOccupancy?: number;
};

export type NightlyLine = {
  date: string;
  base_cents: number;
  adjusted_cents: number;
  applied_rules: string[];
};

export type PricingBreakdown = {
  currency: string;
  nights: number;
  guests: PricingInput["guests"];
  nightly: NightlyLine[];
  subtotal_cents: number;
  fees: { kind: Fee["kind"]; label: string; amount_cents: number }[];
  fees_total_cents: number;
  taxes: { jurisdiction: string; kind: TaxRate["kind"]; amount_cents: number }[];
  taxes_total_cents: number;
  length_of_stay_discount_cents: number;
  total_cents: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Apply weekend / seasonal rules per night. Returns adjusted price + tags. */
function applyPerNightRules(
  baseCents: number,
  date: Date,
  rules: PricingRule[],
): { adjustedCents: number; appliedRules: string[] } {
  const dow = date.getUTCDay();
  const iso = isoDate(date);
  const applied: string[] = [];
  let priceCents = baseCents;

  const sortedRules = [...rules].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );

  for (const rule of sortedRules) {
    if (rule.is_active === false) continue;
    if (rule.starts_on && iso < rule.starts_on) continue;
    if (rule.ends_on && iso > rule.ends_on) continue;

    if (rule.kind === "weekend") {
      const dows = (rule.config.dow as number[]) ?? [5, 6];
      const deltaPct = (rule.config.delta_pct as number) ?? 0;
      if (dows.includes(dow)) {
        priceCents = Math.round(priceCents * (1 + deltaPct / 100));
        applied.push(`weekend(+${deltaPct}%)`);
      }
    } else if (rule.kind === "seasonal") {
      const deltaPct = (rule.config.delta_pct as number) ?? 0;
      priceCents = Math.round(priceCents * (1 + deltaPct / 100));
      applied.push(`seasonal(${deltaPct >= 0 ? "+" : ""}${deltaPct}%)`);
    }
  }

  return { adjustedCents: priceCents, appliedRules: applied };
}

/** Apply length-of-stay / early-bird / last-minute discounts to subtotal. */
function applySubtotalRules(
  subtotalCents: number,
  nights: number,
  daysOut: number,
  rules: PricingRule[],
): number {
  let discountCents = 0;
  for (const rule of rules) {
    if (rule.is_active === false) continue;
    if (rule.kind === "length_of_stay") {
      const minNights = (rule.config.min_nights as number) ?? 7;
      const discountPct = (rule.config.discount_pct as number) ?? 0;
      if (nights >= minNights) {
        discountCents += Math.round(subtotalCents * (discountPct / 100));
      }
    } else if (rule.kind === "early_bird") {
      const minDaysOut = (rule.config.min_days_out as number) ?? 60;
      const discountPct = (rule.config.discount_pct as number) ?? 0;
      if (daysOut >= minDaysOut) {
        discountCents += Math.round(subtotalCents * (discountPct / 100));
      }
    } else if (rule.kind === "last_minute") {
      const maxDaysOut = (rule.config.max_days_out as number) ?? 7;
      const discountPct = (rule.config.discount_pct as number) ?? 0;
      if (daysOut <= maxDaysOut) {
        discountCents += Math.round(subtotalCents * (discountPct / 100));
      }
    }
  }
  return Math.min(discountCents, subtotalCents);
}

function computeFee(fee: Fee, nights: number, guests: number): number {
  const overGuests =
    fee.kind === "extra_guest" && fee.threshold
      ? Math.max(0, guests - fee.threshold)
      : 0;

  switch (fee.applies_per) {
    case "stay":
      if (fee.kind === "extra_guest") {
        return fee.amount_cents * overGuests;
      }
      return fee.amount_cents;
    case "night":
      return fee.amount_cents * nights;
    case "guest_night":
      if (fee.kind === "extra_guest") {
        return fee.amount_cents * overGuests * nights;
      }
      return fee.amount_cents * guests * nights;
  }
}

const FEE_LABELS: Record<Fee["kind"], string> = {
  cleaning: "Cleaning fee",
  extra_guest: "Extra guest fee",
  pet: "Pet fee",
  service: "Service fee",
  resort: "Resort fee",
};

export function computeQuote(input: PricingInput): PricingBreakdown {
  if (input.checkOut <= input.checkIn) {
    throw new Error("checkOut must be strictly after checkIn");
  }

  const nights = daysBetween(input.checkIn, input.checkOut);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysOut = daysBetween(today, input.checkIn);

  const totalGuests =
    (input.guests.adults ?? 0) + (input.guests.children ?? 0);
  const baseOccupancy = input.baseOccupancy ?? 2;

  const rules = input.pricingRules ?? [];
  const fees = input.fees ?? [];
  const taxRates = input.taxRates ?? [];

  const nightly: NightlyLine[] = [];
  let subtotalCents = 0;

  for (let i = 0; i < nights; i += 1) {
    const date = new Date(input.checkIn.getTime() + i * DAY_MS);
    const iso = isoDate(date);
    const baseCents =
      input.perDayPriceCents?.[iso] ?? input.basePriceCents;
    const { adjustedCents, appliedRules } = applyPerNightRules(
      baseCents,
      date,
      rules,
    );
    nightly.push({
      date: iso,
      base_cents: baseCents,
      adjusted_cents: adjustedCents,
      applied_rules: appliedRules,
    });
    subtotalCents += adjustedCents;
  }

  const losDiscountCents = applySubtotalRules(
    subtotalCents,
    nights,
    daysOut,
    rules,
  );
  const subtotalAfterDiscount = subtotalCents - losDiscountCents;

  const feeLines = fees.map((fee) => ({
    kind: fee.kind,
    label: FEE_LABELS[fee.kind],
    amount_cents: computeFee(fee, nights, totalGuests),
  }));
  const feesTotal = feeLines.reduce((sum, f) => sum + f.amount_cents, 0);

  const taxLines = taxRates.map((rate) => {
    const baseAmount =
      rate.applies_to === "fees"
        ? feesTotal
        : rate.applies_to === "nightly"
          ? subtotalAfterDiscount
          : rate.applies_to === "total"
            ? subtotalAfterDiscount + feesTotal
            : subtotalAfterDiscount; // 'subtotal' default
    return {
      jurisdiction: rate.jurisdiction,
      kind: rate.kind,
      amount_cents: Math.round(baseAmount * (rate.rate_pct / 100)),
    };
  });
  const taxesTotal = taxLines.reduce((sum, t) => sum + t.amount_cents, 0);

  const total = subtotalAfterDiscount + feesTotal + taxesTotal;

  return {
    currency: input.currency,
    nights,
    guests: input.guests,
    nightly,
    subtotal_cents: subtotalCents,
    fees: feeLines,
    fees_total_cents: feesTotal,
    taxes: taxLines,
    taxes_total_cents: taxesTotal,
    length_of_stay_discount_cents: losDiscountCents,
    total_cents: total,
  };
}
