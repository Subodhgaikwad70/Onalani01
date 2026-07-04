/**
 * Ensure a pending_payment booking has checkout credentials (lazy init + recovery).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import {
  provisionBeds24Payment,
  useBeds24StripeForListing,
} from "@/lib/beds24/booking-payment";
import { getBeds24StripePublishableKey, resolveBeds24HostedCheckoutUrl } from "@/lib/beds24/stripe";

export type CheckoutCredentials = {
  payment_mode: "platform" | "beds24_stripe";
  client_secret?: string | null;
  checkout_session_id?: string | null;
  checkout_url?: string | null;
  stripe_connect_account_id?: string | null;
  stripe_publishable_key?: string | null;
  total_cents: number;
  currency: string;
  booking_status: string;
  checkout_kind?: "initial" | "change_request_supplemental";
  change_request_id?: string;
};

function appBaseUrl(): string {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function isStaleStripePaymentIntent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
}

async function cancelPlatformPaymentIntent(stripePaymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (intent.status === "requires_payment_method" || intent.status === "requires_confirmation") {
      await stripe.paymentIntents.cancel(stripePaymentIntentId);
    }
  } catch (error) {
    if (!isStaleStripePaymentIntent(error)) {
      console.warn("[checkout-session] Could not cancel platform PaymentIntent", error);
    }
  }
}

async function provisionBeds24Checkout(
  admin: SupabaseClient,
  booking: Record<string, unknown>,
  listing: { beds24_room_id: string },
  beds24BookingId: string | null | undefined,
  base: Pick<CheckoutCredentials, "total_cents" | "currency" | "booking_status">,
  bookingId: string,
  stripePaymentIntentId: string | undefined,
): Promise<CheckoutCredentials> {
  const beds24Payment = await provisionBeds24Payment({
    admin,
    booking: {
      id: booking.id as string,
      code: booking.code as string,
      guest_id: booking.guest_id as string,
      check_in: booking.check_in as string,
      check_out: booking.check_out as string,
      adults: Number(booking.adults),
      children: Number(booking.children),
      total_cents: Number(booking.total_cents),
      currency: String(booking.currency),
      beds24_booking_id: beds24BookingId ?? null,
    },
    beds24RoomId: listing.beds24_room_id,
    appBaseUrl: appBaseUrl(),
  });

  if (stripePaymentIntentId) {
    await cancelPlatformPaymentIntent(stripePaymentIntentId);
  }

  const beds24Patch: Record<string, string | null> = {
    beds24_booking_id: beds24Payment.beds24BookingId,
    beds24_stripe_session_id: beds24Payment.checkoutSessionId,
    beds24_stripe_checkout_url: beds24Payment.checkoutUrl,
    stripe_connect_account_id: beds24Payment.stripeConnectAccountId,
    stripe_payment_intent_id: null,
  };
  const { error: beds24UpdateError } = await admin
    .from("bookings")
    .update({
      payment_provider: "beds24_stripe",
      ...beds24Patch,
    })
    .eq("id", bookingId);
  if (beds24UpdateError) {
    console.warn(
      "[checkout-session] Could not persist Beds24 fields (run migration?):",
      beds24UpdateError.message,
    );
  }

  return {
    ...base,
    payment_mode: "beds24_stripe",
    checkout_session_id: beds24Payment.checkoutSessionId,
    checkout_url: beds24Payment.checkoutUrl,
    stripe_connect_account_id: beds24Payment.stripeConnectAccountId,
    stripe_publishable_key: beds24Payment.stripePublishableKey,
  };
}

async function reusePlatformPaymentIntent(
  stripePaymentIntentId: string,
  base: Pick<CheckoutCredentials, "total_cents" | "currency" | "booking_status">,
): Promise<CheckoutCredentials | null> {
  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (intent.status === "canceled" || intent.status === "succeeded") {
      return null;
    }
    return {
      ...base,
      payment_mode: "platform",
      client_secret: intent.client_secret,
    };
  } catch (error) {
    if (isStaleStripePaymentIntent(error)) {
      console.warn(
        "[checkout-session] Stale PaymentIntent, creating new one:",
        stripePaymentIntentId,
      );
      return null;
    }
    throw error;
  }
}

export async function ensureBookingCheckoutSession(
  admin: SupabaseClient,
  bookingId: string,
): Promise<CheckoutCredentials> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    throw new Error(`Booking lookup failed: ${error.message}`);
  }
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.status !== "pending_payment") {
    throw new Error(`Booking is not awaiting payment (${booking.status})`);
  }
  if (Number(booking.total_cents) <= 0) {
    throw new Error("Nothing to pay for this booking");
  }

  const { data: listing } = await admin
    .from("listings")
    .select("test_payment_mode, beds24_room_id")
    .eq("id", booking.listing_id)
    .maybeSingle();
  if (listing?.test_payment_mode) {
    throw new Error("This listing uses test payment mode");
  }

  const row = booking as Record<string, unknown>;
  const paymentProvider = row.payment_provider as string | undefined;
  const beds24SessionId = row.beds24_stripe_session_id as string | undefined;
  const beds24CheckoutUrl = row.beds24_stripe_checkout_url as string | undefined;
  const stripeConnectAccountId = row.stripe_connect_account_id as string | undefined;
  const stripePaymentIntentId = row.stripe_payment_intent_id as string | undefined;
  const beds24BookingId = row.beds24_booking_id as string | undefined;

  const base = {
    total_cents: booking.total_cents as number,
    currency: booking.currency as string,
    booking_status: booking.status as string,
  };

  const useBeds24 = useBeds24StripeForListing(listing?.beds24_room_id);

  const cachedCheckoutUrl = resolveBeds24HostedCheckoutUrl(beds24CheckoutUrl);

  if (paymentProvider === "beds24_stripe" && beds24SessionId && cachedCheckoutUrl) {
    return {
      ...base,
      payment_mode: "beds24_stripe",
      checkout_session_id: beds24SessionId,
      checkout_url: cachedCheckoutUrl,
      stripe_connect_account_id: stripeConnectAccountId ?? null,
      stripe_publishable_key: getBeds24StripePublishableKey(),
    };
  }

  if (useBeds24 && listing?.beds24_room_id) {
    try {
      return await provisionBeds24Checkout(
        admin,
        row,
        listing as { beds24_room_id: string },
        beds24BookingId,
        base,
        bookingId,
        stripePaymentIntentId,
      );
    } catch (e) {
      console.error("[checkout-session] Beds24 Stripe failed, falling back to platform", e);
    }
  }

  if (stripePaymentIntentId) {
    const reused = await reusePlatformPaymentIntent(stripePaymentIntentId, base);
    if (reused) return reused;
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: Number(booking.total_cents),
    currency: String(booking.currency).toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      booking_id: booking.id as string,
      booking_code: booking.code as string,
    },
  });

  const { error: piUpdateError } = await admin
    .from("bookings")
    .update({
      stripe_payment_intent_id: intent.id,
      payment_provider: "platform",
    })
    .eq("id", bookingId);
  if (piUpdateError) {
    console.warn(
      "[checkout-session] Could not persist PaymentIntent id:",
      piUpdateError.message,
    );
  }

  return {
    ...base,
    payment_mode: "platform",
    client_secret: intent.client_secret,
  };
}
