/**
 * Orchestrates Beds24 booking + Stripe Checkout session for linked listings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBeds24Configured } from "@/lib/beds24/auth";
import {
  cancelBeds24Booking,
  createBeds24Booking,
  Beds24Error,
} from "@/lib/beds24/client";
import {
  createBeds24StripeSession,
  resolveBeds24HostedCheckoutUrl,
  getBeds24StripePublishableKey,
  type StripeCheckoutLineItem,
} from "@/lib/beds24/stripe";

export type PaymentProvider = "platform" | "beds24_stripe";

export function isBeds24StripeEnabled(): boolean {
  return process.env.BEDS24_STRIPE_ENABLED === "true";
}

export function useBeds24StripeForListing(beds24RoomId: string | null | undefined): boolean {
  return Boolean(
    beds24RoomId && isBeds24Configured() && isBeds24StripeEnabled(),
  );
}

export function buildBeds24LineItems(input: {
  totalCents: number;
  currency: string;
  bookingCode: string;
  stayLabel?: string;
}): StripeCheckoutLineItem[] {
  return [
    {
      price_data: {
        currency: input.currency.toLowerCase(),
        product_data: {
          name: input.stayLabel ?? "Vacation rental stay",
          description: `Booking ${input.bookingCode}`,
        },
        unit_amount: input.totalCents,
      },
      quantity: 1,
    },
  ];
}

async function resolveGuestContact(
  admin: SupabaseClient,
  guestId: string,
): Promise<{ firstName: string; lastName: string; email: string }> {
  const [{ data: profile }, { data: authData }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", guestId).maybeSingle(),
    admin.auth.admin.getUserById(guestId),
  ]);

  const displayName = profile?.display_name ?? "Guest";
  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? "Guest";
  const lastName = parts.slice(1).join(" ") || "Guest";
  const email = authData.user?.email ?? "guest@onalani.com";

  return { firstName, lastName, email };
}

export type ProvisionBeds24PaymentInput = {
  admin: SupabaseClient;
  booking: {
    id: string;
    code: string;
    guest_id: string;
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    total_cents: number;
    currency: string;
    beds24_booking_id?: string | null;
  };
  beds24RoomId: string;
  appBaseUrl: string;
};

export type ProvisionBeds24PaymentResult = {
  beds24BookingId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  stripeConnectAccountId: string;
  stripePublishableKey: string;
};

/**
 * Create (or reuse) a Beds24 booking and mint a Stripe Checkout session on the
 * property's connected Stripe account.
 */
export async function provisionBeds24Payment(
  input: ProvisionBeds24PaymentInput,
): Promise<ProvisionBeds24PaymentResult> {
  const { admin, booking, beds24RoomId, appBaseUrl } = input;
  let beds24BookingId = booking.beds24_booking_id ?? null;
  let createdBeds24Booking = false;

  if (!beds24BookingId) {
    const guest = await resolveGuestContact(admin, booking.guest_id);
    const result = await createBeds24Booking({
      roomId: beds24RoomId,
      arrival: booking.check_in,
      departure: booking.check_out,
      numAdult: booking.adults,
      numChild: booking.children,
      guestFirstName: guest.firstName,
      guestLastName: guest.lastName,
      guestEmail: guest.email,
      externalRef: booking.code,
      notes: "Onalani booking — awaiting Stripe payment",
    });
    beds24BookingId = result.id;
    createdBeds24Booking = true;
  }

  const successUrl = `${appBaseUrl}/bookings/${booking.code}/confirmation?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appBaseUrl}/checkout/${booking.code}`;

  try {
    const session = await createBeds24StripeSession({
      bookId: beds24BookingId,
      lineItems: buildBeds24LineItems({
        totalCents: booking.total_cents,
        currency: booking.currency,
        bookingCode: booking.code,
      }),
      successUrl,
      cancelUrl,
      capture: true,
    });

    const checkoutUrl = resolveBeds24HostedCheckoutUrl(session.checkoutUrl);
    if (!checkoutUrl) {
      throw new Beds24Error(
        500,
        session,
        "Beds24 Stripe session did not return a hosted checkout URL",
      );
    }

    return {
      beds24BookingId,
      checkoutSessionId: session.sessionId,
      checkoutUrl,
      stripeConnectAccountId: session.stripeAccount,
      stripePublishableKey: getBeds24StripePublishableKey(),
    };
  } catch (e) {
    if (createdBeds24Booking && beds24BookingId) {
      try {
        await cancelBeds24Booking(beds24BookingId);
      } catch (cancelErr) {
        console.error("[beds24-payment] rollback cancel failed", cancelErr);
      }
    }
    throw e;
  }
}

export async function rollbackBeds24Payment(input: {
  beds24BookingId?: string | null;
}): Promise<void> {
  if (!input.beds24BookingId) return;
  try {
    await cancelBeds24Booking(input.beds24BookingId);
  } catch (e) {
    if (e instanceof Beds24Error && e.status === 404) return;
    console.error("[beds24-payment] rollback failed", e);
  }
}
