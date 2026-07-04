import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureBookingCheckoutSession } from "@/lib/bookings/checkout-session";
import { loadSupplementalChangeCheckout } from "@/lib/bookings/change-request-checkout";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

async function loadPayIntent(
  admin: ReturnType<typeof createSupabaseAdmin>,
  identifier: string,
  guestId: string,
) {
  const lookup = bookingIdentifierLookup(identifier);
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, guest_id, status, total_cents, currency")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (error) return { error: jsonError(500, error.message) };
  if (!booking) return { error: jsonError(404, "Booking not found") };
  if (booking.guest_id !== guestId) {
    return { error: jsonError(403, "Forbidden") };
  }
  const bookingId = booking.id as string;

  if (booking.status === "confirmed" || booking.status === "in_stay") {
    const supplemental = await loadSupplementalChangeCheckout(admin, bookingId);
    if (supplemental) {
      return {
        payload: {
          ...supplemental,
          requires_checkout: true,
        },
      };
    }
    return {
      payload: {
        payment_mode: "platform" as const,
        client_secret: null,
        checkout_session_id: null,
        total_cents: booking.total_cents,
        booking_status: booking.status,
        requires_checkout: false,
      },
    };
  }

  if (booking.status !== "pending_payment") {
    const supplemental = await loadSupplementalChangeCheckout(admin, bookingId);
    if (supplemental) {
      return {
        payload: {
          ...supplemental,
          requires_checkout: true,
        },
      };
    }
    return {
      payload: {
        payment_mode: "platform" as const,
        client_secret: null,
        checkout_session_id: null,
        total_cents: booking.total_cents,
        currency: booking.currency,
        booking_status: booking.status,
        requires_checkout: false,
      },
    };
  }

  try {
    const credentials = await ensureBookingCheckoutSession(admin, bookingId);
    return {
      payload: {
        ...credentials,
        requires_checkout: true,
      },
    };
  } catch (e) {
    console.error("[pay-intent]", e);
    const message =
      e instanceof Error ? e.message : "Could not load payment";
    return { error: jsonError(503, message) };
  }
}

/** Guest retrieves or creates checkout credentials. */
export const GET = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const result = await loadPayIntent(admin, id, session.user.id);
  if (result.error) return result.error;
  return Response.json(result.payload);
});

/** Create checkout session when missing (same as GET, explicit for clients). */
export const POST = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  const result = await loadPayIntent(admin, id, session.user.id);
  if (result.error) return result.error;
  return Response.json(result.payload);
});
