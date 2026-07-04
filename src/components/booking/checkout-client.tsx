"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { BookingFlowShell } from "@/components/booking/booking-flow-shell";
import {
  BookingStaySummary,
  type BookingListingSummary,
} from "@/components/booking/booking-stay-summary";
import {
  bookingAddressLines,
  bookingStayTitle,
  bookingThumbnail,
  parsePricingBreakdown,
  type GuestBookingWithListing,
} from "@/lib/bookings/display";
import { formatMoney } from "@/lib/format";
import { isPlatformStripePublishableKeyConfigured } from "@/lib/stripe/keys";

const platformPk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const platformStripeConfigured = isPlatformStripePublishableKeyConfigured(platformPk);
const platformStripePromise = platformStripeConfigured ? loadStripe(platformPk) : null;

type PayIntentResponse = {
  payment_mode: "platform" | "beds24_stripe";
  client_secret?: string | null;
  checkout_session_id?: string | null;
  checkout_url?: string | null;
  stripe_connect_account_id?: string | null;
  stripe_publishable_key?: string | null;
  total_cents?: number;
  currency?: string;
  booking_status?: string;
  requires_checkout?: boolean;
  checkout_kind?: "initial" | "change_request_supplemental";
  change_request_id?: string;
  proposed_change?: {
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    infants: number;
    pets: number;
    pricing_breakdown?: unknown;
  };
};

function guestSummary(booking: GuestBookingWithListing) {
  const adults = booking.adults ?? 1;
  const children = booking.children ?? 0;
  const infants = booking.infants ?? 0;
  const pets = booking.pets ?? 0;
  const parts = [
    `${adults} adult${adults === 1 ? "" : "s"}`,
    children > 0 ? `${children} child${children === 1 ? "" : "ren"}` : null,
    infants > 0 ? `${infants} infant${infants === 1 ? "" : "s"}` : null,
    pets > 0 ? `${pets} pet${pets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function bookingToListingSummary(booking: GuestBookingWithListing): BookingListingSummary {
  const title = bookingStayTitle(booking);
  const { street, cityLine } = bookingAddressLines(booking);
  const listing = Array.isArray(booking.listings)
    ? booking.listings[0]
    : booking.listings;
  return {
    slug: listing?.slug ?? "",
    title,
    location: [street, cityLine].filter(Boolean).join(" · ") || null,
    imageUrl: bookingThumbnail(booking) ?? "",
  };
}

function proposedGuestSummary(change: NonNullable<PayIntentResponse["proposed_change"]>) {
  const parts = [
    `${change.adults} adult${change.adults === 1 ? "" : "s"}`,
    change.children > 0
      ? `${change.children} child${change.children === 1 ? "" : "ren"}`
      : null,
    change.infants > 0
      ? `${change.infants} infant${change.infants === 1 ? "" : "s"}`
      : null,
    change.pets > 0 ? `${change.pets} pet${change.pets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function PlatformPayForm({
  bookingId,
  changeRequestId,
}: {
  bookingId: string;
  changeRequestId?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !paymentReady || paymentLoadError) return;
    setBusy(true);
    const returnParams = changeRequestId
      ? `?change_request=${encodeURIComponent(changeRequestId)}`
      : "";
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/bookings/${encodeURIComponent(bookingId)}/confirmation${returnParams}`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Payment failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-[#dfe6e1] bg-[#fafcfb] p-4">
        <PaymentElement
          onReady={() => {
            setPaymentReady(true);
            setPaymentLoadError(null);
          }}
          onLoadError={(event) => {
            setPaymentReady(false);
            setPaymentLoadError(
              event.error.message ??
                "Payment form could not load. Check your Stripe publishable key.",
            );
          }}
        />
      </div>
      {paymentLoadError ? (
        <p className="text-sm text-red-600" role="alert">
          {paymentLoadError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !paymentReady || Boolean(paymentLoadError)}
        className="w-full rounded-xl bg-[#2d6a4f] py-3.5 text-sm font-bold text-white transition hover:bg-[#245a43] disabled:opacity-50"
      >
        {busy ? "Processing…" : paymentReady ? "Complete payment" : "Loading payment form…"}
      </button>
      <p className="text-center text-xs text-[#9ca3af]">
        Secure checkout powered by Stripe. Your card is charged only when you confirm.
      </p>
    </form>
  );
}

function Beds24CheckoutButton({
  bookingId,
  initialCheckoutUrl,
}: {
  bookingId: string;
  initialCheckoutUrl?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchCheckoutUrl(): Promise<PayIntentResponse | null> {
    const res = await fetch(
      `/api/bookings/${encodeURIComponent(bookingId)}/pay-intent`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(
        (j as { error?: { message?: string } })?.error?.message ??
          "Could not refresh checkout",
      );
    }
    return (await res.json()) as PayIntentResponse;
  }

  async function onPay() {
    setBusy(true);
    setError(null);
    try {
      let checkoutUrl = initialCheckoutUrl?.trim() ?? null;

      if (!checkoutUrl) {
        const fresh = await fetchCheckoutUrl();
        checkoutUrl = fresh?.checkout_url?.trim() ?? null;
      }

      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }

      setError(
        "Checkout link could not be prepared. Refresh the page or try again from your trips.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#dfe6e1] bg-[#fafcfb] p-4 text-sm text-[#5f6b66]">
        Payment is processed securely through the property&apos;s Stripe account via Beds24.
        You&apos;ll be redirected to Stripe Checkout to enter your card details.
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onPay}
        disabled={busy}
        className="w-full rounded-xl bg-[#2d6a4f] py-3.5 text-sm font-bold text-white transition hover:bg-[#245a43] disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : "Continue to Stripe Checkout"}
      </button>
      <p className="text-center text-xs text-[#9ca3af]">
        After payment you&apos;ll return to{" "}
        <Link href={`/bookings/${encodeURIComponent(bookingId)}/confirmation`} className="underline">
          your confirmation
        </Link>
        .
      </p>
    </div>
  );
}

export function CheckoutClient({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [payIntent, setPayIntent] = useState<PayIntentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: booking } = useQuery({
    queryKey: ["checkout-booking", bookingId],
    queryFn: async () => {
      const res = await fetch(
        `/api/bookings?id=${encodeURIComponent(bookingId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("booking");
      const j = (await res.json()) as { bookings: GuestBookingWithListing[] };
      return j.bookings[0] ?? null;
    },
  });

  const quote = useMemo(() => {
    if (!booking) return null;
    return parsePricingBreakdown(booking.pricing_breakdown);
  }, [booking]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/bookings/${encodeURIComponent(bookingId)}/pay-intent`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          const message =
            j?.error?.message ??
            "Could not start checkout. Try again from your trips page.";
          if (cancelled) return;
          setCheckoutError(message);
          toast.error(message);
          return;
        }
        const data = (await res.json()) as PayIntentResponse;
        if (cancelled) return;

        if (
          data.checkout_kind !== "change_request_supplemental" &&
          (data.booking_status === "confirmed" ||
            data.booking_status === "in_stay" ||
            data.booking_status === "requested")
        ) {
          router.replace(`/bookings/${encodeURIComponent(bookingId)}/confirmation`);
          return;
        }

        if (data.booking_status === "pending_payment") {
          const hasCredentials =
            Boolean(data.client_secret) ||
            Boolean(data.checkout_url) ||
            Boolean(data.checkout_session_id);
          if (!hasCredentials) {
            setCheckoutError(
              "Payment could not be loaded. Please try again from your trips page.",
            );
            return;
          }
          setPayIntent(data);
          return;
        }

        const hasCredentials =
          Boolean(data.client_secret) ||
          Boolean(data.checkout_url) ||
          Boolean(data.checkout_session_id);

        if (!hasCredentials) {
          setCheckoutError(
            "Payment could not be started. Check Stripe/Beds24 configuration or try again from your trips page.",
          );
          return;
        }

        setPayIntent(data);
      } catch {
        toast.error("Checkout failed");
        router.push("/account/trips");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, router]);

  const listingSummary = booking ? bookingToListingSummary(booking) : null;
  const totalCents = payIntent?.total_cents ?? null;
  const currency = payIntent?.currency ?? "USD";
  const isBeds24 = payIntent?.payment_mode === "beds24_stripe";
  const needsPlatformStripe =
    !loading && payIntent != null && !isBeds24 && !platformStripeConfigured;
  const isSupplemental = payIntent?.checkout_kind === "change_request_supplemental";
  const proposedChange = payIntent?.proposed_change;
  const sidebarQuote = proposedChange?.pricing_breakdown
    ? parsePricingBreakdown(proposedChange.pricing_breakdown)
    : quote;
  const bookingPathId = encodeURIComponent(bookingId);

  if (needsPlatformStripe) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-[#dfe6e1] bg-white p-6 shadow-sm">
          <h1 className="font-(family-name:--font-lora) text-xl font-semibold text-[#1f2937]">
            Payment is temporarily unavailable
          </h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            Secure card payment is not configured. In local development, set{" "}
            <code className="rounded bg-[#f4f6f5] px-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
            in <code className="rounded bg-[#f4f6f5] px-1">.env</code> to the matching{" "}
            <code className="rounded bg-[#f4f6f5] px-1">pk_test_...</code> key from{" "}
            <a
              href="https://dashboard.stripe.com/test/apikeys"
              className="font-medium text-[#2d6a4f] underline"
              target="_blank"
              rel="noreferrer"
            >
              Stripe Dashboard → API keys
            </a>
            , then restart <code className="rounded bg-[#f4f6f5] px-1">npm run dev</code>. If you
            are booking as a guest, please try again shortly or contact support.
          </p>
          <Link
            href="/properties"
            className="mt-6 inline-flex rounded-lg border border-[#cfd8d3] px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f4f6f5]"
          >
            Search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <BookingFlowShell
      step="payment"
      backHref={isSupplemental ? `/account/trips/${bookingPathId}` : listingSummary?.slug ? `/listings/${listingSummary.slug}/book` : "/account/trips"}
      backLabel={isSupplemental ? "Back to trip" : "Back to review"}
      title={isSupplemental ? "Pay to confirm changes" : "Complete payment"}
      subtitle={
        totalCents != null
          ? isSupplemental
            ? `Additional amount due ${formatMoney(totalCents, currency)}. Pay below to confirm your updated reservation.`
            : `Amount due ${formatMoney(totalCents, currency)}. Enter your payment details below to confirm your reservation.`
          : isSupplemental
            ? "Pay the balance below to confirm your updated reservation."
            : "Enter your payment details to confirm your reservation."
      }
      sidebar={
        booking && listingSummary ? (
          <BookingStaySummary
            listing={listingSummary}
            checkIn={proposedChange?.check_in ?? booking.check_in}
            checkOut={proposedChange?.check_out ?? booking.check_out}
            guestLabel={proposedChange ? proposedGuestSummary(proposedChange) : guestSummary(booking)}
            quote={sidebarQuote}
            creditApplied={booking.credit_applied_cents ?? 0}
            totalDue={isSupplemental ? undefined : totalCents}
          />
        ) : null
      }
    >
      <section className="rounded-2xl border border-[#dfe6e1] bg-white p-5 shadow-sm md:p-6">
        {loading ? (
          <p className="text-sm text-[#6b7280]">Loading checkout…</p>
        ) : checkoutError ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{checkoutError}</p>
            <Link
              href="/account/trips"
              className="inline-flex rounded-lg border border-[#cfd8d3] px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f4f6f5]"
            >
              Back to trips
            </Link>
          </div>
        ) : isBeds24 &&
          (payIntent?.checkout_url || payIntent?.checkout_session_id) ? (
          <Beds24CheckoutButton
            bookingId={bookingId}
            initialCheckoutUrl={payIntent.checkout_url}
          />
        ) : payIntent?.client_secret && platformStripePromise ? (
          <Elements stripe={platformStripePromise} options={{ clientSecret: payIntent.client_secret }}>
            <PlatformPayForm
              bookingId={bookingId}
              changeRequestId={payIntent.change_request_id}
            />
          </Elements>
        ) : (
          <p className="text-sm text-[#6b7280]">Preparing checkout…</p>
        )}
      </section>
    </BookingFlowShell>
  );
}
