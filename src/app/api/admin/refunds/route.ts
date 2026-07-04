import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { getBeds24StripeCharges, refundBeds24StripeCharge } from "@/lib/beds24/stripe";
import { recordAdminAction } from "@/lib/admin/audit";
import { getBookingCashPaidCents } from "@/lib/bookings/payment-ledger";
import { log, requestIdFromHeaders } from "@/lib/observability/logger";

const refundBodySchema = z.object({
  booking_id: z.string().uuid(),
  amount_cents: z.number().int().min(1),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/admin/refunds — manually issue a Stripe refund against a booking.
 * Useful for goodwill refunds outside the cancellation policy.
 */
export const POST = requireAdmin(async (req, _ctx, session) => {
  const requestId = requestIdFromHeaders(req.headers);
  const { data, error } = await parseJsonBody(req, refundBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", data.booking_id)
    .maybeSingle();
  if (!booking) return jsonError(404, "Booking not found");

  const refundableCents = await getBookingCashPaidCents(admin, data.booking_id);
  if (data.amount_cents > refundableCents) {
    return jsonError(
      400,
      `Refund exceeds remaining refundable balance of ${refundableCents} cents`,
    );
  }

  let refundId: string;

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
        return jsonError(400, "No Beds24 Stripe charge found on this booking");
      }
      const refund = await refundBeds24StripeCharge({
        bookId: booking.beds24_booking_id,
        chargeId: paid.id,
        amountCents: data.amount_cents,
      });
      refundId = refund.id;
    } catch (e) {
      log.error(
        "refund.beds24_failed",
        {
          request_id: requestId,
          booking_id: data.booking_id,
          admin_id: session.user.id,
          amount_cents: data.amount_cents,
        },
        e,
      );
      return jsonError(502, `Beds24 Stripe refund failed: ${(e as Error).message}`);
    }
  } else if (booking.stripe_payment_intent_id) {
    let refund;
    try {
      const stripe = getStripe();
      refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: data.amount_cents,
        reason: "requested_by_customer",
        metadata: {
          booking_id: data.booking_id,
          admin_id: session.user.id,
          reason: data.reason ?? "",
        },
      });
    } catch (e) {
      log.error(
        "refund.stripe_failed",
        {
          request_id: requestId,
          booking_id: data.booking_id,
          admin_id: session.user.id,
          amount_cents: data.amount_cents,
        },
        e,
      );
      return jsonError(502, `Stripe refund failed: ${(e as Error).message}`);
    }
    refundId = refund.id;
  } else {
    return jsonError(400, "No payment record on this booking");
  }

  const { error: ledgerError } = await admin.from("payment_history").insert({
    booking_id: data.booking_id,
    guest_id: booking.guest_id,
    kind: "refund",
    amount_cents: -data.amount_cents,
    currency: booking.currency,
    stripe_object_id: refundId,
    metadata: { admin_initiated: true, reason: data.reason ?? null },
  });
  if (ledgerError) {
    log.error("refund.ledger_write_failed", {
      request_id: requestId,
      booking_id: data.booking_id,
      admin_id: session.user.id,
      refund_id: refundId,
      amount_cents: data.amount_cents,
      error_message: ledgerError.message,
    });
    return jsonError(
      500,
      `Refund was issued externally but local ledger write failed: ${ledgerError.message}`,
    );
  }

  await recordAdminAction({
    adminId: session.user.id,
    action: "refund.manual",
    targetType: "booking",
    targetId: data.booking_id,
    after: { amount_cents: data.amount_cents, refund_id: refundId },
  });

  return Response.json({ refund_id: refundId, amount_cents: data.amount_cents });
});
