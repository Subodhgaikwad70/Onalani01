import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBeds24LineItems,
} from "@/lib/beds24/booking-payment";
import {
  createBeds24StripeSession,
  resolveBeds24HostedCheckoutUrl,
} from "@/lib/beds24/stripe";
import { getStripe } from "@/lib/stripe/client";
import type { BookingForChange, ChangeRequestRow } from "@/lib/bookings/change-request";
import { getBookingCashPaidCents } from "@/lib/bookings/payment-ledger";

function appBaseUrl(): string {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export type ChangePaymentResult = {
  delta_cents: number;
  supplemental_payment_intent_id?: string;
  beds24_checkout_url?: string;
  partial_refund_id?: string;
};

/**
 * Create checkout credentials for an approved change that increases the balance.
 * Does not mutate booking dates/pricing — that happens after payment succeeds.
 */
export async function setupChangePayment(
  admin: SupabaseClient,
  booking: BookingForChange & {
    payment_provider?: string | null;
    beds24_booking_id?: string | null;
  },
  request: ChangeRequestRow,
  deltaCents: number,
): Promise<ChangePaymentResult> {
  if (deltaCents <= 0) return { delta_cents: deltaCents };

  if (
    booking.payment_provider === "beds24_stripe" &&
    booking.beds24_booking_id
  ) {
    const session = await createBeds24StripeSession({
      bookId: booking.beds24_booking_id,
      lineItems: buildBeds24LineItems({
        totalCents: deltaCents,
        currency: booking.currency,
        bookingCode: booking.code,
        stayLabel: `Additional charge — booking ${booking.code}`,
      }),
      successUrl: `${appBaseUrl()}/bookings/${booking.code}/confirmation?session_id={CHECKOUT_SESSION_ID}&change_request=${request.id}`,
      cancelUrl: `${appBaseUrl()}/account/trips/${booking.code}`,
      capture: true,
    });
    const checkoutUrl = resolveBeds24HostedCheckoutUrl(session.checkoutUrl);
    if (!checkoutUrl) {
      throw new Error("Beds24 did not return a supplemental checkout URL");
    }

    await admin
      .from("bookings")
      .update({
        beds24_stripe_session_id: session.sessionId,
        beds24_stripe_checkout_url: checkoutUrl,
        stripe_connect_account_id: session.stripeAccount,
      })
      .eq("id", booking.id);

    await admin.from("payment_history").insert({
      booking_id: booking.id,
      guest_id: booking.guest_id,
      kind: "charge",
      amount_cents: deltaCents,
      currency: booking.currency,
      metadata: {
        status: "pending",
        supplemental: true,
        change_request_id: request.id,
        provider: "beds24_stripe",
      },
    });

    return { delta_cents: deltaCents, beds24_checkout_url: checkoutUrl };
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: deltaCents,
    currency: booking.currency.toLowerCase(),
    metadata: {
      booking_id: booking.id,
      change_request_id: request.id,
      kind: "change_request_supplemental",
    },
    automatic_payment_methods: { enabled: true },
  });

  await admin
    .from("bookings")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", booking.id);

  await admin.from("payment_history").insert({
    booking_id: booking.id,
    guest_id: booking.guest_id,
    kind: "charge",
    amount_cents: deltaCents,
    currency: booking.currency,
    stripe_object_id: intent.id,
    metadata: {
      status: "pending",
      supplemental: true,
      change_request_id: request.id,
    },
  });

  return {
    delta_cents: deltaCents,
    supplemental_payment_intent_id: intent.id,
  };
}

/**
 * Issue partial refund when an approved change lowers the balance.
 */
export async function reconcileChangeRefund(
  admin: SupabaseClient,
  booking: BookingForChange & {
    payment_provider?: string | null;
  },
  request: ChangeRequestRow,
  deltaCents: number,
): Promise<ChangePaymentResult> {
  const refundCents = Math.min(Math.abs(deltaCents), await getBookingCashPaidCents(admin, booking.id));
  if (refundCents <= 0) return { delta_cents: deltaCents };

  if (booking.payment_provider === "beds24_stripe") {
    console.warn(
      `[change-request] price decreased by ${refundCents}c on beds24_stripe booking ${booking.code} — manual refund may be required`,
    );
    return { delta_cents: deltaCents };
  }

  if (!booking.stripe_payment_intent_id) {
    return { delta_cents: deltaCents };
  }

  const stripe = getStripe();
  const refund = await stripe.refunds.create({
    payment_intent: booking.stripe_payment_intent_id,
    amount: refundCents,
    reason: "requested_by_customer",
    metadata: {
      booking_id: booking.id,
      change_request_id: request.id,
      kind: "change_request_price_decrease",
    },
  });
  await admin.from("payment_history").insert({
    booking_id: booking.id,
    guest_id: booking.guest_id,
    kind: "refund",
    amount_cents: -refundCents,
    currency: booking.currency,
    stripe_object_id: refund.id,
    metadata: { change_request_id: request.id },
  });
  return { delta_cents: deltaCents, partial_refund_id: refund.id };
}

export async function notifyChangePayment(
  admin: SupabaseClient,
  booking: { id: string; code: string; guest_id: string },
  result: ChangePaymentResult,
  options?: { awaiting_payment?: boolean },
): Promise<void> {
  if (result.delta_cents > 0 && options?.awaiting_payment) {
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "payment_due",
      title: "Complete payment to confirm your changes",
      body: `Your reservation change for booking ${booking.code} was approved. Pay $${(result.delta_cents / 100).toFixed(2)} to confirm the new dates and total.`,
      link: `/checkout/${booking.code}`,
      payload: {
        booking_id: booking.id,
        delta_cents: result.delta_cents,
        beds24_checkout_url: result.beds24_checkout_url ?? null,
      },
    });
    return;
  }

  if (result.delta_cents > 0) {
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "payment_due",
      title: "Additional payment required",
      body: `Booking ${booking.code} was updated. Please pay the remaining balance of $${(result.delta_cents / 100).toFixed(2)}.`,
      link: `/checkout/${booking.code}`,
      payload: {
        booking_id: booking.id,
        delta_cents: result.delta_cents,
        beds24_checkout_url: result.beds24_checkout_url ?? null,
      },
    });
    return;
  }

  if (result.delta_cents < 0 && result.partial_refund_id) {
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "refund_issued",
      title: "Partial refund issued",
      body: `Your booking ${booking.code} total was reduced after the change. A partial refund was processed.`,
      link: `/account/trips/${booking.code}`,
      payload: { booking_id: booking.id, refund_id: result.partial_refund_id },
    });
  }
}
