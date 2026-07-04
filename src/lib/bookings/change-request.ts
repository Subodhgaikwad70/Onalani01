import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeQuote,
  type Fee,
  type PricingBreakdown,
  type PricingRule,
  type TaxRate,
} from "@/lib/bookings/pricing";
import {
  CHANGEABLE_BOOKING_STATUSES,
  type ChangeableBookingStatus,
} from "@/lib/bookings/change-request-constants";
import { reconcileChangeRefund, setupChangePayment, type ChangePaymentResult } from "@/lib/bookings/change-request-payment";
import { syncBeds24AfterBookingChange } from "@/lib/beds24/sync-booking-change";
import { validateStayAgainstSlice } from "@/lib/booking/stay-validation";
import { getListingAvailabilitySlice } from "@/lib/bookings/listing-availability";
import { getBookingCashPaidCents } from "@/lib/bookings/payment-ledger";
import { getStripe } from "@/lib/stripe/client";

export { CHANGEABLE_BOOKING_STATUSES, type ChangeableBookingStatus };

export const changeRequestFieldsSchema = z.object({
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.object({
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20).default(0),
    infants: z.number().int().min(0).max(10).default(0),
    pets: z.number().int().min(0).max(5).default(0),
  }),
  guest_notes: z.string().max(2000).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
});

export type ChangeRequestFields = z.infer<typeof changeRequestFieldsSchema>;

export type BookingForChange = {
  id: string;
  code: string;
  guest_id: string;
  listing_id: string;
  property_id: string;
  status: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  guest_notes: string | null;
  promo_discount_cents: number;
  credit_applied_cents: number;
  total_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  payment_provider?: string | null;
  beds24_booking_id?: string | null;
};

export function assertBookingChangeable(status: string): void {
  if (!CHANGEABLE_BOOKING_STATUSES.includes(status as ChangeableBookingStatus)) {
    throw new Error(
      `Bookings with status "${status.replace(/_/g, " ")}" cannot be modified`,
    );
  }
}

export async function assertNoDateOverlap(
  admin: SupabaseClient,
  input: {
    listingId: string;
    checkIn: string;
    checkOut: string;
    excludeBookingId: string;
  },
): Promise<void> {
  const { data: overlap, error } = await admin
    .from("bookings")
    .select("id")
    .eq("listing_id", input.listingId)
    .neq("id", input.excludeBookingId)
    .in("status", ["pending_payment", "requested", "confirmed", "in_stay"])
    .lt("check_in", input.checkOut)
    .gt("check_out", input.checkIn);
  if (error) throw new Error(error.message);
  if (overlap && overlap.length > 0) {
    throw new Error("Selected dates conflict with another reservation");
  }
}

/** Validate proposed dates against Beds24/local availability (excludes this booking). */
export async function assertChangeDatesAvailable(
  admin: SupabaseClient,
  booking: BookingForChange,
  fields: Pick<ChangeRequestFields, "check_in" | "check_out">,
): Promise<void> {
  await loadChangeRequestAvailability(admin, booking, fields);
}

async function loadChangeRequestAvailability(
  admin: SupabaseClient,
  booking: BookingForChange,
  fields: Pick<ChangeRequestFields, "check_in" | "check_out">,
) {
  await assertNoDateOverlap(admin, {
    listingId: booking.listing_id,
    checkIn: fields.check_in,
    checkOut: fields.check_out,
    excludeBookingId: booking.id,
  });

  const { data: listing, error } = await admin
    .from("listings")
    .select(
      "id, beds24_room_id, currency, base_price_cents, min_nights, max_nights, unit_occupancy, property_id",
    )
    .eq("id", booking.listing_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing) throw new Error("Listing not found");

  const availability = await getListingAvailabilitySlice(admin, {
    listingId: booking.listing_id,
    from: fields.check_in,
    to: fields.check_out,
    excludeBookingId: booking.id,
    listing,
  });

  const validation = validateStayAgainstSlice(
    availability,
    fields.check_in,
    fields.check_out,
    {
      listingMinNights: listing.min_nights,
      listingMaxNights: listing.max_nights,
    },
  );
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return { listing, availability };
}

export async function computeChangeQuote(
  admin: SupabaseClient,
  booking: BookingForChange,
  fields: ChangeRequestFields,
): Promise<{
  breakdown: PricingBreakdown;
  cleaning_fee_cents: number;
  extra_guest_fee_cents: number;
  service_fee_cents: number;
  total_cents: number;
  cash_due_cents: number;
}> {
  const checkIn = new Date(`${fields.check_in}T00:00:00Z`);
  const checkOut = new Date(`${fields.check_out}T00:00:00Z`);
  if (checkOut <= checkIn) {
    throw new Error("check_out must be after check_in");
  }

  const { listing, availability } = await loadChangeRequestAvailability(
    admin,
    booking,
    fields,
  );

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (nights < (listing.min_nights ?? 1)) {
    throw new Error(`Stay must be at least ${listing.min_nights} night(s)`);
  }
  if (listing.max_nights && nights > listing.max_nights) {
    throw new Error(`Stay must be at most ${listing.max_nights} nights`);
  }

  const totalGuests = fields.guests.adults + fields.guests.children;
  if (listing.unit_occupancy && totalGuests > listing.unit_occupancy) {
    throw new Error(`Listing accommodates up to ${listing.unit_occupancy} guests`);
  }

  const [feesRes, rulesRes, propTaxRes] = await Promise.all([
    admin.from("listing_fees").select("*").eq("listing_id", listing.id),
    admin
      .from("listing_pricing_rules")
      .select("*")
      .eq("listing_id", listing.id)
      .eq("is_active", true),
    admin
      .from("property_tax_rates")
      .select("tax_rates(*)")
      .eq("property_id", listing.property_id),
  ]);

  const taxRates: TaxRate[] = (
    (propTaxRes.data ?? []) as Array<{ tax_rates: TaxRate | TaxRate[] | null }>
  ).flatMap((r) =>
    Array.isArray(r.tax_rates) ? r.tax_rates : r.tax_rates ? [r.tax_rates] : [],
  );

  const perDay: Record<string, number> = {
    ...(availability.prices_cents ?? {}),
  };

  const breakdown = computeQuote({
    basePriceCents: listing.base_price_cents,
    currency: listing.currency,
    checkIn,
    checkOut,
    guests: fields.guests,
    fees: (feesRes.data ?? []) as Fee[],
    pricingRules: (rulesRes.data ?? []) as PricingRule[],
    taxRates,
    perDayPriceCents: perDay,
    baseOccupancy: listing.unit_occupancy ?? 2,
  });

  const cleaningFee =
    breakdown.fees.find((f) => f.kind === "cleaning")?.amount_cents ?? 0;
  const extraGuestFee =
    breakdown.fees.find((f) => f.kind === "extra_guest")?.amount_cents ?? 0;
  const serviceFee =
    breakdown.fees.find((f) => f.kind === "service")?.amount_cents ?? 0;

  const { quote_total_cents, cash_due_cents } = computeChangeRequestTotals(
    booking,
    breakdown.total_cents,
  );

  return {
    breakdown,
    cleaning_fee_cents: cleaningFee,
    extra_guest_fee_cents: extraGuestFee,
    service_fee_cents: serviceFee,
    total_cents: quote_total_cents,
    cash_due_cents,
  };
}

/** Repriced stay total (after promo) and net cash due (after credits already on booking). */
export function computeChangeRequestTotals(
  booking: Pick<BookingForChange, "promo_discount_cents" | "credit_applied_cents">,
  grossCents: number,
): { quote_total_cents: number; cash_due_cents: number } {
  const promoDiscount = Math.min(
    Number(booking.promo_discount_cents ?? 0),
    grossCents,
  );
  const quote_total_cents = Math.max(0, grossCents - promoDiscount);
  const creditCarryForward = Math.min(
    Number(booking.credit_applied_cents ?? 0),
    quote_total_cents,
  );
  const cash_due_cents = Math.max(0, quote_total_cents - creditCarryForward);
  return { quote_total_cents, cash_due_cents };
}

/** Net cash the guest should owe after a change request is applied. */
export function changeRequestCashDueCents(
  booking: Pick<BookingForChange, "credit_applied_cents">,
  quoteTotalCents: number,
): number {
  const creditCarryForward = Math.min(
    Number(booking.credit_applied_cents ?? 0),
    quoteTotalCents,
  );
  return Math.max(0, quoteTotalCents - creditCarryForward);
}

export type ChangeRequestRow = {
  id: string;
  booking_id: string;
  requested_by: string;
  requested_by_role: string;
  status: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  guest_notes: string | null;
  subtotal_cents: number;
  cleaning_fee_cents: number;
  extra_guest_fee_cents: number;
  service_fee_cents: number;
  taxes_cents: number;
  total_cents: number;
  currency: string;
  pricing_breakdown: PricingBreakdown;
  message: string | null;
  created_at: string;
};

export async function applyBookingFieldsOnly(
  admin: SupabaseClient,
  booking: BookingForChange,
  request: ChangeRequestRow,
): Promise<void> {
  await assertChangeDatesAvailable(admin, booking, {
    check_in: request.check_in,
    check_out: request.check_out,
  });

  const previous = {
    check_in: booking.check_in,
    check_out: booking.check_out,
    listing_id: booking.listing_id,
  };

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      check_in: request.check_in,
      check_out: request.check_out,
      adults: request.adults,
      children: request.children,
      infants: request.infants,
      pets: request.pets,
      guest_notes: request.guest_notes,
      subtotal_cents: request.subtotal_cents,
      cleaning_fee_cents: request.cleaning_fee_cents,
      extra_guest_fee_cents: request.extra_guest_fee_cents,
      service_fee_cents: request.service_fee_cents,
      taxes_cents: request.taxes_cents,
      total_cents: changeRequestCashDueCents(booking, request.total_cents),
      pricing_breakdown: request.pricing_breakdown,
    })
    .eq("id", booking.id);
  if (updErr) throw new Error(updErr.message);

  try {
    await syncBeds24AfterBookingChange(admin, {
      bookingId: booking.id,
      previous,
    });
  } catch (e) {
    console.error("[change-request] Beds24 sync failed", e);
    throw new Error(
      e instanceof Error
        ? `Could not update Beds24: ${e.message}`
        : "Could not update Beds24",
    );
  }
}

export type ApproveChangeResult = {
  applied: boolean;
  requires_payment: boolean;
  payment?: ChangePaymentResult;
};

/**
 * Staff approves a change request.
 * Price increases wait for guest payment before dates/totals are applied.
 */
export async function approveBookingChangeRequest(
  admin: SupabaseClient,
  booking: BookingForChange,
  request: ChangeRequestRow,
  decidedBy: string,
): Promise<ApproveChangeResult> {
  const cashPaid = await getBookingCashPaidCents(admin, booking.id);
  const newCashDue = changeRequestCashDueCents(booking, request.total_cents);
  const delta = newCashDue - cashPaid;

  if (
    booking.status === "pending_payment" &&
    booking.stripe_payment_intent_id &&
    booking.payment_provider !== "beds24_stripe" &&
    delta !== 0
  ) {
    const stripe = getStripe();
    await stripe.paymentIntents.update(booking.stripe_payment_intent_id, {
      amount: newCashDue,
    });
    await applyBookingFieldsOnly(admin, booking, request);
    return { applied: true, requires_payment: false, payment: { delta_cents: delta } };
  }

  if (delta > 0) {
    const payment = await setupChangePayment(admin, booking, request, delta);
    await admin
      .from("booking_change_requests")
      .update({
        status: "approved_pending_payment",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    return { applied: false, requires_payment: true, payment };
  }

  await applyBookingFieldsOnly(admin, booking, request);

  let payment: ChangePaymentResult = { delta_cents: delta };
  if (delta < 0) {
    const { data: refreshed } = await admin
      .from("bookings")
      .select("*")
      .eq("id", booking.id)
      .single();
    if (refreshed) {
      payment = await reconcileChangeRefund(
        admin,
        refreshed as BookingForChange,
        request,
        delta,
      );
    }
  }

  return { applied: true, requires_payment: false, payment };
}

/** Apply an approved change after supplemental payment succeeds. */
export async function completeApprovedChangeRequest(
  admin: SupabaseClient,
  bookingId: string,
  changeRequestId?: string,
): Promise<ChangeRequestRow | null> {
  let query = admin
    .from("booking_change_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("status", "approved_pending_payment");

  if (changeRequestId) {
    query = query.eq("id", changeRequestId);
  }

  const { data: request, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) return null;

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (bookingErr || !booking) {
    throw new Error(bookingErr?.message ?? "Booking not found");
  }

  await applyBookingFieldsOnly(admin, booking as BookingForChange, request);

  await admin
    .from("booking_change_requests")
    .update({ status: "approved" })
    .eq("id", request.id);

  await admin.from("notifications").insert({
    recipient_id: booking.guest_id,
    kind: "change_request_approved",
    title: "Reservation change confirmed",
    body: `Your updated stay for booking ${booking.code} is now confirmed.`,
    link: `/account/trips/${booking.code}`,
    payload: { booking_id: bookingId, change_request_id: request.id },
  });

  return request as ChangeRequestRow;
}

/** @deprecated Use approveBookingChangeRequest or completeApprovedChangeRequest. */
export async function applyBookingChangeRequest(
  admin: SupabaseClient,
  booking: BookingForChange,
  request: ChangeRequestRow,
): Promise<ChangePaymentResult> {
  await applyBookingFieldsOnly(admin, booking, request);
  const cashPaid = await getBookingCashPaidCents(admin, booking.id);
  const newCashDue = changeRequestCashDueCents(booking, request.total_cents);
  const delta = newCashDue - cashPaid;
  if (delta < 0) {
    return reconcileChangeRefund(admin, booking, request, delta);
  }
  if (delta > 0) {
    return setupChangePayment(admin, booking, request, delta);
  }
  return { delta_cents: 0 };
}

export function summarizeChange(
  before: BookingForChange,
  after: Pick<
    ChangeRequestRow,
    "check_in" | "check_out" | "adults" | "children" | "total_cents" | "currency"
  >,
): string {
  const parts = [
    `Dates: ${before.check_in} → ${before.check_out} proposed as ${after.check_in} → ${after.check_out}`,
    `Guests: ${before.adults} adults → ${after.adults} adults`,
    `Total: ${(before.total_cents / 100).toFixed(2)} → ${(after.total_cents / 100).toFixed(2)} ${after.currency}`,
  ];
  return parts.join("\n");
}
