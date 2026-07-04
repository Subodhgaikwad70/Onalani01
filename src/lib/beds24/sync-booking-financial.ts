/**
 * Sync Beds24 invoice lines from actual Stripe payments (not quote totals).
 * Platform credits and promos appear in booking notes only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBeds24FinancialFromPayments,
  replaceBeds24BookingFinancial,
  type Beds24FinancialPayload,
  type PaidChargeForInvoice,
} from "@/lib/beds24/booking-financial";
import { getBeds24StripeCharges } from "@/lib/beds24/stripe";
import { getBookingPaidChargeRows } from "@/lib/bookings/payment-ledger";

export type Beds24NotesContext = "confirmed" | "request" | "modified";

function centsToMajor(cents: number): number {
  return Math.round(Number(cents)) / 100;
}

function isSuccessfulChargeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "succeeded" || s === "paid" || s === "captured";
}

export function buildBeds24BookingNotes(
  booking: {
    code: string;
    credit_applied_cents?: number | null;
    promo_discount_cents?: number | null;
    payment_provider?: string | null;
  },
  context: Beds24NotesContext = "confirmed",
): string {
  const lines: string[] = [];

  if (context === "request") {
    lines.push(
      `Onalani ${booking.code} — booking request (paid via platform Stripe)`,
    );
  } else if (context === "modified") {
    lines.push(`Onalani ${booking.code} — reservation modified`);
  } else {
    const via =
      booking.payment_provider === "beds24_stripe"
        ? "Beds24 Stripe"
        : "platform Stripe";
    lines.push(`Onalani ${booking.code} — paid via ${via}`);
  }

  const credit = Number(booking.credit_applied_cents ?? 0);
  const promo = Number(booking.promo_discount_cents ?? 0);
  if (credit > 0) {
    lines.push(
      `Platform credits applied: $${centsToMajor(credit).toFixed(2)} (not charged via Stripe)`,
    );
  }
  if (promo > 0) {
    lines.push(
      `Promo discount: $${centsToMajor(promo).toFixed(2)} (Onalani only)`,
    );
  }

  return lines.join("\n");
}

export async function collectPaidStripeChargesForInvoice(
  admin: SupabaseClient,
  booking: {
    id: string;
    beds24_booking_id?: string | null;
    payment_provider?: string | null;
  },
): Promise<PaidChargeForInvoice[]> {
  const ledgerRows = await getBookingPaidChargeRows(admin, booking.id);
  const byStripeId = new Map<string, PaidChargeForInvoice>();

  for (const row of ledgerRows) {
    byStripeId.set(row.stripe_object_id, {
      stripeObjectId: row.stripe_object_id,
      amountCents: row.amount_cents,
      createdAt: row.created_at,
      supplemental: row.metadata?.supplemental === true,
    });
  }

  if (
    booking.payment_provider === "beds24_stripe" &&
    booking.beds24_booking_id
  ) {
    try {
      const apiCharges = await getBeds24StripeCharges(
        String(booking.beds24_booking_id),
      );
      for (const charge of apiCharges) {
        if (!isSuccessfulChargeStatus(charge.status)) continue;
        const netCents =
          charge.amount - Number(charge.amountRefunded ?? 0);
        if (netCents <= 0) continue;

        const existing = byStripeId.get(charge.id);
        if (existing) {
          existing.amountCents = netCents;
        } else {
          byStripeId.set(charge.id, {
            stripeObjectId: charge.id,
            amountCents: netCents,
            createdAt: charge.id,
            supplemental: false,
          });
        }
      }
    } catch (e) {
      console.warn("[beds24-financial] Beds24 Stripe charges lookup failed", e);
    }
  }

  return [...byStripeId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/** Replace Beds24 charge lines with one row per successful Stripe payment. */
export async function syncBeds24BookingFinancialFromPayments(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ synced: boolean; financial?: Beds24FinancialPayload }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, code, beds24_booking_id, payment_provider, credit_applied_cents, promo_discount_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking?.beds24_booking_id) return { synced: false };

  const charges = await collectPaidStripeChargesForInvoice(admin, booking);
  const financial = buildBeds24FinancialFromPayments(
    charges,
    booking.code as string,
  );
  if (!financial) return { synced: false };

  await replaceBeds24BookingFinancial(
    String(booking.beds24_booking_id),
    financial,
  );
  return { synced: true, financial };
}
