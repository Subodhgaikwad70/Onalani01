import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { computeCancellation, type CancellationRule } from "@/lib/bookings/cancellation";
import {
  createRecoveryEntitlement,
} from "@/lib/bookings/cancellation-recovery";
import { issueCancellationCredits } from "@/lib/credits/issue";
import {
  getBookingCashPaidCents,
  getBookingStripeCharges,
} from "@/lib/bookings/payment-ledger";
import { ensureBeds24BookingCancelled } from "@/lib/beds24/cancel-booking";
import { Beds24Error } from "@/lib/beds24/client";
import {
  getBeds24StripeCharges,
  refundBeds24StripeCharge,
} from "@/lib/beds24/stripe";
import { getStripe } from "@/lib/stripe/client";
import { refundCreditsForBooking } from "@/lib/credits/redemption";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

const cancelBodySchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/bookings/{id}/cancel — guest- or staff-initiated cancellation.
 *
 * Applies the snapshotted cancellation policy:
 *   - issues a Stripe refund for the cash portion
 *   - marks credit refunds as pending (re-credited in Phase 7's redemption logic)
 *   - cancels Beds24 booking if synced
 *   - flips bookings.status accordingly
 */
export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data: body, error } = await parseJsonBody(req, cancelBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);
  const { data: booking, error: lookupError } = await admin
    .from("bookings")
    .select("*, listings!inner(beds24_room_id)")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (lookupError) return jsonError(500, lookupError.message);
  if (!booking) return jsonError(404, "Booking not found");
  const bookingId = booking.id as string;

  const isGuest = booking.guest_id === session.user.id;
  const isStaff = isAdminRole(session.role);
  if (!isGuest && !isStaff) {
    return jsonError(403, "Cannot cancel this booking");
  }

  if (
    [
      "cancelled_by_guest",
      "cancelled_by_admin",
      "completed",
      "expired",
      "declined",
    ].includes(booking.status)
  ) {
    return jsonError(409, `Booking already ${booking.status}`);
  }

  const policySnapshot = booking.cancellation_policy_snapshot as {
    rules: CancellationRule[];
  } | null;
  const rules = policySnapshot?.rules ?? [
    { hours_before: 0, refund_pct: isStaff ? 100 : 0 },
  ];

  // Staff cancellations issue a full refund regardless of policy.
  const effectiveRules: CancellationRule[] =
    isStaff ? [{ hours_before: 0, refund_pct: 100 }] : rules;

  const cashPaidCents = await getBookingCashPaidCents(admin, bookingId);

  const outcome = computeCancellation({
    rules: effectiveRules,
    checkIn: new Date(`${booking.check_in}T00:00:00Z`),
    cashPaidCents,
    creditPaidCents: booking.credit_applied_cents,
  });

  const cashRefundCents = Math.min(outcome.cash_refund_cents, cashPaidCents);
  const guaranteedCreditCents = outcome.guaranteed_credit_cents;

  // Issue refund on the correct payment rail (best effort).
  let stripeRefundId: string | null = null;
  let refundFailed = false;
  let refundError: string | null = null;
  if (cashRefundCents > 0) {
    if (
      booking.payment_provider === "beds24_stripe" &&
      booking.beds24_booking_id
    ) {
      try {
        const charges = await getBeds24StripeCharges(booking.beds24_booking_id);
        const paid = charges.find((c) =>
          ["succeeded", "paid", "captured"].includes(c.status.toLowerCase()),
        );
        if (!paid) {
          refundFailed = true;
          refundError = "No Beds24 Stripe charge found to refund";
        } else {
          const refund = await refundBeds24StripeCharge({
            bookId: booking.beds24_booking_id,
            chargeId: paid.id,
            amountCents: Math.min(cashRefundCents, paid.amount - (paid.amountRefunded ?? 0)),
          });
          stripeRefundId = refund.id;
        }
      } catch (e) {
        console.error("[cancel] Beds24 Stripe refund failed", e);
        refundFailed = true;
        refundError =
          e instanceof Beds24Error
            ? e.message
            : e instanceof Error
              ? e.message
              : "unknown error";
      }
    } else {
      try {
        const stripe = getStripe();
        const chargeRows = await getBookingStripeCharges(admin, bookingId);
        let refundRemaining = cashRefundCents;

        if (chargeRows.length > 0) {
          for (const charge of chargeRows) {
            if (refundRemaining <= 0) break;
            const refundAmount = Math.min(refundRemaining, charge.amount_cents);
            const refund = await stripe.refunds.create({
              payment_intent: charge.stripe_object_id,
              amount: refundAmount,
              reason: "requested_by_customer",
            });
            stripeRefundId = refund.id;
            refundRemaining -= refundAmount;
          }
        } else if (booking.stripe_payment_intent_id) {
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent_id,
            amount: cashRefundCents,
            reason: "requested_by_customer",
          });
          stripeRefundId = refund.id;
        }
      } catch (e) {
        console.error("[cancel] Stripe refund failed", e);
        refundFailed = true;
        refundError =
          e instanceof Error ? e.message : "Could not process refund";
      }
    }
  }

  const beds24RoomId = (
    booking.listings as { beds24_room_id?: string | null } | null
  )?.beds24_room_id;
  const beds24Cancel = await ensureBeds24BookingCancelled({
    admin,
    booking: {
      id: booking.id as string,
      code: booking.code as string,
      check_in: booking.check_in as string,
      check_out: booking.check_out as string,
      listing_id: booking.listing_id as string,
      beds24_booking_id: booking.beds24_booking_id as string | null,
    },
    beds24RoomId,
    cancelledBy: isStaff ? "admin" : "guest",
  });

  const newStatus = isStaff ? "cancelled_by_admin" : "cancelled_by_guest";

  // Update booking + payment_history in two writes (no transactions in PostgREST).
  await admin
    .from("bookings")
    .update({
      status: newStatus,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: body.reason ?? null,
    })
    .eq("id", bookingId);

  const ledgerRows: Array<Record<string, unknown>> = [];
  if (cashRefundCents > 0 && stripeRefundId) {
    ledgerRows.push({
      booking_id: bookingId,
      guest_id: booking.guest_id,
      kind: "refund",
      amount_cents: -cashRefundCents,
      currency: booking.currency,
      stripe_object_id: stripeRefundId,
      metadata: { rule: outcome.rule_matched, refund_pct: outcome.refund_pct },
    });
  }
  if (outcome.credit_refund_cents > 0) {
    ledgerRows.push({
      booking_id: bookingId,
      guest_id: booking.guest_id,
      kind: "credit_refund",
      amount_cents: -outcome.credit_refund_cents,
      currency: booking.currency,
      metadata: { rule: outcome.rule_matched },
    });
  }

  // Re-credit any used credit_grants up to the refund amount.
  if (outcome.credit_refund_cents > 0) {
    await refundCreditsForBooking({
      bookingId,
      amountCents: outcome.credit_refund_cents,
    });
  }

  let issuedGuaranteedCredits = 0;
  if (!isStaff && guaranteedCreditCents > 0) {
    issuedGuaranteedCredits = await issueCancellationCredits({
      guestId: booking.guest_id as string,
      bookingId,
      amountCents: guaranteedCreditCents,
      currency: booking.currency as string,
    });
  }

  if (!isStaff && outcome.recovery_entitlement_cents > 0) {
    await createRecoveryEntitlement(admin, {
      sourceBookingId: bookingId,
      guestId: booking.guest_id as string,
      listingId: booking.listing_id as string,
      checkIn: booking.check_in as string,
      checkOut: booking.check_out as string,
      currency: booking.currency as string,
      maxRecoveryCents: outcome.recovery_entitlement_cents,
    });
  }

  if (issuedGuaranteedCredits > 0) {
    ledgerRows.push({
      booking_id: bookingId,
      guest_id: booking.guest_id,
      kind: "credit_refund",
      amount_cents: -issuedGuaranteedCredits,
      currency: booking.currency,
      metadata: {
        rule: outcome.rule_matched,
        guaranteed: true,
      },
    });
  }

  if (ledgerRows.length > 0) {
    await admin.from("payment_history").insert(ledgerRows);
  }

  await syncBookingToAdminInbox(admin, {
    bookingId,
    event: "cancelled",
  });

  return Response.json({
    ok: true,
    new_status: newStatus,
    cancellation: {
      ...outcome,
      guaranteed_credits_issued_cents: issuedGuaranteedCredits,
    },
    beds24_cancelled: beds24Cancel.cancelled,
    refund_failed: refundFailed,
    refund_error: refundError,
    refund_id: stripeRefundId,
  });
});
