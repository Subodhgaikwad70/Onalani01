/**
 * Beds24 invoice fields. Requires bookings-financial scope on the API token.
 *
 * Beds24 v2 invoiceItems use `type: "charge"`, `amount` (dollars), `qty`, `description`
 * — not `price` (which creates zero-amount lines).
 *
 * Production sync uses `buildBeds24FinancialFromPayments` (actual Stripe payments).
 * `buildBeds24FinancialPayload` is quote-based and kept for debug scripts only.
 */

import type { PricingBreakdown } from "@/lib/bookings/pricing";
import { request as beds24Request } from "@/lib/beds24/client";

export type Beds24InvoiceItem = {
  type: "charge";
  description: string;
  qty: number;
  amount: number;
};

export type Beds24FinancialPayload = {
  price: number;
  tax: number;
  invoiceItems: Beds24InvoiceItem[];
};

function centsToMajor(cents: number): number {
  return Math.round(Number(cents)) / 100;
}

const FEE_LABELS: Record<string, string> = {
  cleaning: "Cleaning fee",
  extra_guest: "Extra guest fee",
  service: "Service fee",
  resort: "Resort fee",
  pet: "Pet fee",
};

function grossTotalCents(
  booking: {
    subtotal_cents?: number | null;
    cleaning_fee_cents?: number | null;
    extra_guest_fee_cents?: number | null;
    service_fee_cents?: number | null;
    taxes_cents?: number | null;
    total_cents?: number | null;
  },
  breakdown: PricingBreakdown | null | undefined,
): number {
  if (breakdown?.total_cents != null && breakdown.total_cents > 0) {
    return breakdown.total_cents;
  }
  return (
    Number(booking.subtotal_cents ?? 0) +
    Number(booking.cleaning_fee_cents ?? 0) +
    Number(booking.extra_guest_fee_cents ?? 0) +
    Number(booking.service_fee_cents ?? 0) +
    Number(booking.taxes_cents ?? 0)
  );
}

export type PaidChargeForInvoice = {
  stripeObjectId: string;
  amountCents: number;
  createdAt: string;
  supplemental: boolean;
};

/** One invoice line per successful Stripe payment. */
export function buildBeds24FinancialFromPayments(
  charges: PaidChargeForInvoice[],
  code: string,
): Beds24FinancialPayload | null {
  if (charges.length === 0) return null;

  const invoiceItems: Beds24InvoiceItem[] = charges.map((charge, index) => {
    let description: string;
    if (charge.supplemental) {
      description = `Additional Stripe payment — ${code}`;
    } else if (charges.length > 1 && index > 0) {
      description = `Stripe payment (${index + 1}) — ${code}`;
    } else {
      description = `Stripe payment — ${code}`;
    }
    return {
      type: "charge",
      description,
      qty: 1,
      amount: centsToMajor(charge.amountCents),
    };
  });

  const totalCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
  return {
    price: centsToMajor(totalCents),
    tax: 0,
    invoiceItems,
  };
}

/** @deprecated Quote-based breakdown — use payment-based sync instead. */
export function buildBeds24FinancialPayload(booking: {
  code: string;
  subtotal_cents?: number | null;
  cleaning_fee_cents?: number | null;
  extra_guest_fee_cents?: number | null;
  service_fee_cents?: number | null;
  taxes_cents?: number | null;
  total_cents?: number | null;
  pricing_breakdown?: unknown;
}): Beds24FinancialPayload | null {
  const breakdown = booking.pricing_breakdown as PricingBreakdown | null | undefined;
  const grossCents = grossTotalCents(booking, breakdown);
  if (grossCents <= 0) return null;

  const items: Beds24InvoiceItem[] = [];

  const lodgingCents = breakdown
    ? Math.max(
        0,
        breakdown.subtotal_cents - (breakdown.length_of_stay_discount_cents ?? 0),
      )
    : Number(booking.subtotal_cents ?? 0);

  if (lodgingCents > 0) {
    const nights = breakdown?.nights ?? 1;
    items.push({
      type: "charge",
      description: `Lodging (${nights} night${nights === 1 ? "" : "s"}) — ${booking.code}`,
      qty: 1,
      amount: centsToMajor(lodgingCents),
    });
  }

  if (breakdown?.fees?.length) {
    for (const fee of breakdown.fees) {
      if (fee.amount_cents <= 0) continue;
      items.push({
        type: "charge",
        description: fee.label,
        qty: 1,
        amount: centsToMajor(fee.amount_cents),
      });
    }
  } else {
    const columnFees: Array<[string, number | null | undefined]> = [
      ["cleaning", booking.cleaning_fee_cents],
      ["extra_guest", booking.extra_guest_fee_cents],
      ["service", booking.service_fee_cents],
    ];
    for (const [kind, cents] of columnFees) {
      const amount = Number(cents ?? 0);
      if (amount <= 0) continue;
      items.push({
        type: "charge",
        description: FEE_LABELS[kind] ?? kind,
        qty: 1,
        amount: centsToMajor(amount),
      });
    }
  }

  const taxCents = Number(
    booking.taxes_cents ?? breakdown?.taxes_total_cents ?? 0,
  );
  if (taxCents > 0) {
    items.push({
      type: "charge",
      description: "Taxes",
      qty: 1,
      amount: centsToMajor(taxCents),
    });
  }

  if (items.length === 0) {
    items.push({
      type: "charge",
      description: `Onalani stay — ${booking.code}`,
      qty: 1,
      amount: centsToMajor(grossCents),
    });
  }

  return {
    price: centsToMajor(grossCents),
    tax: centsToMajor(taxCents),
    invoiceItems: items,
  };
}

type Beds24InvoiceRow = {
  id?: number;
  type?: string;
  amount?: number;
};

/** Replace charge lines on an existing Beds24 booking (avoids duplicate $0 rows). */
export async function replaceBeds24BookingFinancial(
  beds24BookingId: string,
  financial: Beds24FinancialPayload,
): Promise<void> {
  const detail = await beds24Request<{
    data?: Array<{ invoiceItems?: Beds24InvoiceRow[] }>;
  }>("/bookings", {
    searchParams: {
      id: beds24BookingId,
      includeInvoiceItems: "true",
    },
  });

  const existing = detail.data?.[0]?.invoiceItems ?? [];
  const chargeIds = existing
    .filter((row) => row.id != null && (row.type === "charge" || row.type == null))
    .map((row) => row.id!);

  if (chargeIds.length > 0) {
    await beds24Request("/bookings", {
      method: "POST",
      body: JSON.stringify([
        {
          id: Number(beds24BookingId),
          invoiceItems: chargeIds.map((itemId) => ({ id: itemId })),
        },
      ]),
    });
  }

  await beds24Request("/bookings", {
    method: "POST",
    body: JSON.stringify([
      {
        id: Number(beds24BookingId),
        price: financial.price,
        tax: financial.tax,
        invoiceItems: financial.invoiceItems,
      },
    ]),
  });
}

/** Re-push invoice lines from recorded Stripe payments. */
export async function resyncBeds24BookingFinancial(
  admin: import("@supabase/supabase-js").SupabaseClient,
  booking: { id: string; beds24_booking_id?: string | null },
): Promise<{ synced: boolean; financial?: Beds24FinancialPayload }> {
  const { syncBeds24BookingFinancialFromPayments } = await import(
    "@/lib/beds24/sync-booking-financial"
  );
  return syncBeds24BookingFinancialFromPayments(admin, booking.id);
}
