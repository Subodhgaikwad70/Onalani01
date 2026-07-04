import type Stripe from "stripe";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { cardSummaryFromPaymentIntent } from "@/lib/stripe/payment-card";
import { finalizeBookingAfterPayment } from "@/lib/bookings/finalize-after-payment";
import { completeApprovedChangeRequest } from "@/lib/bookings/change-request";
import { markSupplementalChargePaid } from "@/lib/bookings/supplemental-payment";
import { alertOps, log, requestIdFromHeaders } from "@/lib/observability/logger";

/**
 * POST /api/webhooks/stripe
 *
 * Handles payment_intent.succeeded / payment_intent.payment_failed.
 */
export const POST = async (request: Request) => {
  const requestId = requestIdFromHeaders(request.headers);
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return jsonError(401, "Missing signature");

  const stripe = getStripe();
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    return jsonError(400, `Webhook signature failed: ${(e as Error).message}`);
  }

  const admin = createSupabaseAdmin();
  log.info("stripe.webhook.received", {
    request_id: requestId,
    stripe_event_id: event.id,
    stripe_event_type: event.type,
  });

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intentFromEvent = event.data.object as Stripe.PaymentIntent;
      const bookingId = intentFromEvent.metadata?.booking_id;
      if (!bookingId) break;

      if (intentFromEvent.metadata?.kind === "change_request_supplemental") {
        try {
          const changeRequestId = intentFromEvent.metadata?.change_request_id;
          const { data: booking } = await admin
            .from("bookings")
            .select("guest_id")
            .eq("id", bookingId)
            .maybeSingle();
          if (!booking) {
            throw new Error(`Booking ${bookingId} not found`);
          }
          await markSupplementalChargePaid(admin, {
            bookingId,
            guestId: booking.guest_id as string,
            stripeObjectId: intentFromEvent.id,
            amountCents: intentFromEvent.amount_received,
            currency: intentFromEvent.currency,
          });
          await completeApprovedChangeRequest(
            admin,
            bookingId,
            typeof changeRequestId === "string" ? changeRequestId : undefined,
          );
        } catch (e) {
          await alertOps(
            "stripe.supplemental_finalize_failed",
            {
              request_id: requestId,
              stripe_event_id: event.id,
              booking_id: bookingId,
              payment_intent_id: intentFromEvent.id,
            },
            e,
          );
          return jsonError(500, "Supplemental payment finalization failed");
        }
        break;
      }

      try {
        const intent = await stripe.paymentIntents.retrieve(intentFromEvent.id, {
          expand: ["payment_method", "latest_charge.payment_method_details"],
        });
        const card = cardSummaryFromPaymentIntent(intent);
        await finalizeBookingAfterPayment(admin, {
          bookingId,
          chargeAmountCents: intent.amount_received,
          currency: intent.currency,
          stripeObjectId: intent.id,
          paymentCardLast4: card.last4,
          paymentCardBrand: card.brand,
        });
      } catch (e) {
        await alertOps(
          "stripe.booking_finalize_failed",
          {
            request_id: requestId,
            stripe_event_id: event.id,
            booking_id: bookingId,
            payment_intent_id: intentFromEvent.id,
          },
          e,
        );
        return jsonError(500, "Payment finalization failed");
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = intent.metadata?.booking_id;
      if (!bookingId) break;
      await admin
        .from("bookings")
        .update({ status: "expired" })
        .eq("id", bookingId)
        .eq("status", "pending_payment");
      break;
    }

    default:
      break;
  }

  return Response.json({ received: true });
};
