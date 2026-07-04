import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { cardSummaryFromPaymentIntent } from "@/lib/stripe/payment-card";
import { confirmBeds24StripePayment } from "@/lib/beds24/confirm-payment";
import { completeApprovedChangeRequest } from "@/lib/bookings/change-request";
import { finalizeBookingAfterPayment } from "@/lib/bookings/finalize-after-payment";
import { getBookingCashPaidCents } from "@/lib/bookings/payment-ledger";
import { recordPlatformPaymentFromIntent } from "@/lib/bookings/record-platform-payment";
import { markSupplementalChargePaid } from "@/lib/bookings/supplemental-payment";
import { getBeds24StripeCharges } from "@/lib/beds24/stripe";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

async function finalizePlatformPayment(
  admin: ReturnType<typeof createSupabaseAdmin>,
  id: string,
) {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("guest_id, status, stripe_payment_intent_id, currency")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking?.stripe_payment_intent_id) {
    return {
      confirmed: false,
      status: booking?.status ?? "unknown",
      payment_recorded: false,
    };
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id, {
    expand: ["payment_method", "latest_charge.payment_method_details"],
  });

  if (intent.status !== "succeeded") {
    return { confirmed: false, status: booking.status, payment_recorded: false };
  }

  const card = cardSummaryFromPaymentIntent(intent);

  if (intent.metadata?.kind === "change_request_supplemental") {
    const changeRequestId = intent.metadata?.change_request_id;
    await markSupplementalChargePaid(admin, {
      bookingId: id,
      guestId: booking.guest_id,
      stripeObjectId: intent.id,
      amountCents: intent.amount_received,
      currency: intent.currency,
    });
    await completeApprovedChangeRequest(
      admin,
      id,
      typeof changeRequestId === "string" ? changeRequestId : undefined,
    );
    return {
      confirmed: true,
      status: booking.status,
      payment_recorded: true,
      change_applied: true,
    };
  }

  if (booking.status === "pending_payment") {
    const result = await finalizeBookingAfterPayment(admin, {
      bookingId: id,
      chargeAmountCents: intent.amount_received,
      currency: intent.currency,
      stripeObjectId: intent.id,
      paymentCardLast4: card.last4,
      paymentCardBrand: card.brand,
    });
    return {
      confirmed: result.status === "confirmed",
      status: result.status,
      payment_recorded: true,
    };
  }

  await recordPlatformPaymentFromIntent(admin, {
    bookingId: id,
    guestId: booking.guest_id,
    intent,
  });

  return {
    confirmed: booking.status === "confirmed" || booking.status === "in_stay",
    status: booking.status,
    payment_recorded: true,
  };
}

async function finalizeBeds24SupplementalPayment(
  admin: ReturnType<typeof createSupabaseAdmin>,
  bookingId: string,
  beds24BookingId: string,
) {
  const { data: pendingRow } = await admin
    .from("payment_history")
    .select("id, amount_cents, metadata")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .contains("metadata", { status: "pending", supplemental: true })
    .maybeSingle();
  if (!pendingRow) {
    return { payment_recorded: false, change_applied: false };
  }

  const supplementalCents = Number(pendingRow.amount_cents);
  const cashPaidBefore = await getBookingCashPaidCents(admin, bookingId);
  const targetPaid = cashPaidBefore + supplementalCents;

  const charges = await getBeds24StripeCharges(beds24BookingId);
  const stripePaid = charges
    .filter((c) => ["succeeded", "paid", "captured"].includes(c.status.toLowerCase()))
    .reduce((sum, c) => sum + c.amount - (c.amountRefunded ?? 0), 0);

  if (stripePaid < targetPaid) {
    return { payment_recorded: false, change_applied: false };
  }

  const paid = charges.find((c) =>
    ["succeeded", "paid", "captured"].includes(c.status.toLowerCase()),
  );

  const meta = (pendingRow.metadata as Record<string, unknown> | null) ?? {};
  await admin
    .from("payment_history")
    .update({
      stripe_object_id: paid?.id ?? null,
      metadata: {
        ...meta,
        status: "succeeded",
        supplemental: true,
        provider: "beds24_stripe",
      },
    })
    .eq("id", pendingRow.id);

  const changeRequestId =
    typeof meta.change_request_id === "string" ? meta.change_request_id : undefined;
  await completeApprovedChangeRequest(admin, bookingId, changeRequestId);

  return { payment_recorded: true, change_applied: true };
}

/**
 * POST /api/bookings/{id}/confirm-payment
 *
 * Verify payment (platform Stripe or Beds24) and finalize the booking.
 */
export const POST = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, guest_id, payment_provider, status, stripe_payment_intent_id, currency, beds24_booking_id",
    )
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!booking) return jsonError(404, "Booking not found");
  if (booking.guest_id !== session.user.id) {
    return jsonError(403, "Forbidden");
  }
  const bookingId = booking.id as string;

  const { data: pendingSupplement } = await admin
    .from("payment_history")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .contains("metadata", { status: "pending", supplemental: true })
    .maybeSingle();

  if (
    booking.status !== "pending_payment" &&
    booking.status !== "requested" &&
    !pendingSupplement
  ) {
    return Response.json({
      confirmed:
        booking.status === "confirmed" || booking.status === "in_stay",
      status: booking.status,
      payment_recorded: true,
    });
  }

  try {
    if (booking.payment_provider === "beds24_stripe") {
      if (
        pendingSupplement &&
        booking.beds24_booking_id &&
        booking.status !== "pending_payment"
      ) {
        const supplemental = await finalizeBeds24SupplementalPayment(
          admin,
          bookingId,
          booking.beds24_booking_id,
        );
        return Response.json({
          confirmed: true,
          status: booking.status,
          payment_recorded: supplemental.payment_recorded,
          change_applied: supplemental.change_applied,
        });
      }

      const result = await confirmBeds24StripePayment(admin, bookingId);
      const { data: updated } = await admin
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .single();
      return Response.json({
        confirmed: result.confirmed,
        already_confirmed: result.alreadyConfirmed,
        status: updated?.status ?? booking.status,
        payment_recorded: result.paymentRecorded,
      });
    }

    return Response.json(await finalizePlatformPayment(admin, bookingId));
  } catch (e) {
    console.error("[confirm-payment]", e);
    return Response.json({
      confirmed: false,
      status: booking.status,
      payment_recorded: false,
    });
  }
});
