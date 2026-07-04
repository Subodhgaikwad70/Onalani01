"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { formatDate, formatMoney } from "@/lib/format";

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

function hasStripeReturnParams(params: URLSearchParams): boolean {
  return (
    params.has("session_id") ||
    (params.has("payment_intent") &&
      params.get("redirect_status") === "succeeded")
  );
}

export function BookingConfirmationClient({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [booking, setBooking] = useState<GuestBookingWithListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/bookings?id=${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          if (!cancelled) setError("Could not load booking");
          return;
        }
        const data = (await res.json()) as { bookings: GuestBookingWithListing[] };
        const row = data.bookings?.[0] ?? null;
        if (cancelled) return;
        setBooking(row);

        if (!row) return;

        const changeRequestId = searchParams.get("change_request");
        const returningFromStripe = hasStripeReturnParams(searchParams);

        if (
          row.status !== "pending_payment" &&
          (changeRequestId || returningFromStripe)
        ) {
          setConfirmingPayment(true);
          try {
            for (let attempt = 0; attempt < 5; attempt += 1) {
              const confirmRes = await fetch(
                `/api/bookings/${encodeURIComponent(id)}/confirm-payment`,
                {
                  method: "POST",
                  credentials: "include",
                },
              );
              let paymentOk = false;
              if (confirmRes.ok) {
                const confirmBody = (await confirmRes.json()) as {
                  payment_recorded?: boolean;
                  change_applied?: boolean;
                };
                paymentOk = Boolean(confirmBody.payment_recorded);
                if (paymentOk) setPaymentRecorded(true);
              }
              const refresh = await fetch(
                `/api/bookings?id=${encodeURIComponent(id)}`,
                { credentials: "include" },
              );
              if (refresh.ok) {
                const refreshed = (await refresh.json()) as {
                  bookings: GuestBookingWithListing[];
                };
                const updated = refreshed.bookings?.[0] ?? row;
                if (!cancelled) setBooking(updated);
                if (paymentOk) {
                  setLoading(false);
                  return;
                }
              }
              if (attempt < 4) {
                await new Promise((r) => setTimeout(r, 1200));
              }
            }
          } finally {
            if (!cancelled) setConfirmingPayment(false);
          }
          if (!cancelled) setLoading(false);
          return;
        }

        if (row.status === "pending_payment") {
          const returningFromStripe = hasStripeReturnParams(searchParams);
          const beds24Stripe = row.payment_provider === "beds24_stripe";
          const shouldConfirm =
            returningFromStripe || beds24Stripe;

          if (shouldConfirm) {
            setConfirmingPayment(true);
            try {
              for (let attempt = 0; attempt < 5; attempt += 1) {
                const confirmRes = await fetch(
                  `/api/bookings/${encodeURIComponent(id)}/confirm-payment`,
                  {
                    method: "POST",
                    credentials: "include",
                  },
                );
                let paymentOk = false;
                if (confirmRes.ok) {
                  const confirmBody = (await confirmRes.json()) as {
                    payment_recorded?: boolean;
                    status?: string;
                  };
                  paymentOk = Boolean(confirmBody.payment_recorded);
                  if (paymentOk) setPaymentRecorded(true);
                }
                const refresh = await fetch(
                  `/api/bookings?id=${encodeURIComponent(id)}`,
                  { credentials: "include" },
                );
                if (refresh.ok) {
                  const refreshed = (await refresh.json()) as {
                    bookings: GuestBookingWithListing[];
                  };
                  const updated = refreshed.bookings?.[0] ?? row;
                  if (!cancelled) setBooking(updated);
                  if (updated.status !== "pending_payment") {
                    if (paymentOk) setPaymentRecorded(true);
                    setLoading(false);
                    return;
                  }
                }
                if (attempt < 4) {
                  await new Promise((r) => setTimeout(r, 1200));
                }
              }
              if (!cancelled) {
                setError(
                  "Payment received — confirmation is still processing. Check your trips in a moment.",
                );
                setLoading(false);
              }
            } finally {
              if (!cancelled) setConfirmingPayment(false);
            }
            return;
          }

          if (!cancelled) {
            router.replace(`/checkout/${encodeURIComponent(id)}`);
          }
          return;
        }
      } catch {
        if (!cancelled) setError("Could not load booking");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router, searchParams]);

  const quote = useMemo(
    () => (booking ? parsePricingBreakdown(booking.pricing_breakdown) : null),
    [booking],
  );

  const isRequested = booking?.status === "requested";
  const isConfirmed =
    booking?.status === "confirmed" || booking?.status === "in_stay";
  const listingSummary = booking ? bookingToListingSummary(booking) : null;

  const title = confirmingPayment
    ? "Confirming payment…"
    : isRequested
      ? "Payment received — request sent"
      : isConfirmed
        ? "Payment received — reservation confirmed"
        : "Booking update";

  const subtitle = confirmingPayment
    ? "We're verifying your payment with Stripe. This usually takes a few seconds."
    : isRequested
      ? "Your card was charged successfully. Your request was sent to the host — you'll be notified when they respond."
      : isConfirmed
        ? "Your payment went through and your stay is booked."
        : "View your trip details for the latest status.";

  if (loading || booking?.status === "pending_payment") {
    return (
      <BookingFlowShell
        step="confirmation"
        backHref="/account/trips"
        backLabel="View all trips"
        title="Processing…"
        subtitle={
          confirmingPayment
            ? "Confirming your payment…"
            : "Taking you to checkout…"
        }
      >
        <p className="text-sm text-[#6b7280]">
          {confirmingPayment ? "Confirming your payment…" : "Redirecting to checkout…"}
        </p>
      </BookingFlowShell>
    );
  }

  return (
    <BookingFlowShell
      step="confirmation"
      backHref="/account/trips"
      backLabel="View all trips"
      title={title}
      subtitle={subtitle}
      sidebar={
        booking && listingSummary ? (
          <BookingStaySummary
            listing={listingSummary}
            checkIn={booking.check_in}
            checkOut={booking.check_out}
            guestLabel={guestSummary(booking)}
            quote={quote}
            creditApplied={booking.credit_applied_cents ?? 0}
            totalDue={booking.total_cents}
          />
        ) : null
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : booking ? (
        <div className="space-y-6">
          <section
            className={
              isConfirmed
                ? "overflow-hidden rounded-2xl border border-[#2d6a4f]/20 bg-[#e8eeea] p-6 md:p-8"
                : isRequested
                  ? "overflow-hidden rounded-2xl border border-[#e8dcc8] bg-[#faf6ef] p-6 md:p-8"
                  : "overflow-hidden rounded-2xl border border-[#dfe6e1] bg-[#fafcfb] p-6 md:p-8"
            }
          >
            <p
              className={
                isConfirmed
                  ? "text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d6a4f]"
                  : isRequested
                    ? "text-[10px] font-bold uppercase tracking-[0.18em] text-[#92682a]"
                    : "text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]"
              }
            >
              {paymentRecorded || isConfirmed || isRequested
                ? "Payment successful"
                : "Booking status"}
            </p>
            <p className="mt-3 font-(family-name:--font-lora) text-2xl font-semibold text-[#1f2937]">
              Confirmation #{booking.code}
            </p>
            {(paymentRecorded || isConfirmed || isRequested) && (
              <p className="mt-2 text-sm font-medium text-[#2d6a4f]">
                {formatMoney(booking.total_cents, booking.currency)} paid
                {(booking.credit_applied_cents ?? 0) > 0 ? (
                  <>
                    {" "}
                    ({formatMoney(booking.credit_applied_cents ?? 0, booking.currency)} credits
                    applied)
                  </>
                ) : null}
              </p>
            )}
            <p className="mt-2 text-sm text-[#5f6b66]">
              Status:{" "}
              <span className="font-semibold text-[#1f2937]">
                {isRequested
                  ? "request sent — pending host approval"
                  : booking.status.replace(/_/g, " ")}
              </span>
            </p>
            <p className="mt-1 text-sm text-[#5f6b66]">
              {formatDate(booking.check_in)} → {formatDate(booking.check_out)} ·{" "}
              {formatMoney(booking.total_cents, booking.currency)}
              {(booking.credit_applied_cents ?? 0) > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-[#5f6b66]">
                    {formatMoney(booking.credit_applied_cents ?? 0, booking.currency)} credits
                    applied
                  </span>
                </>
              ) : null}
            </p>
          </section>

          <section className="rounded-2xl border border-[#dfe6e1] bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              What&apos;s next
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-[#5f6b66]">
              {isRequested ? (
                <>
                  <li>The host will review your paid request and respond soon.</li>
                  <li>If approved, your reservation is confirmed. If declined, your payment will be refunded per policy.</li>
                </>
              ) : (
                <>
                  <li>View full details, message your host, or manage changes from your trips page.</li>
                  <li>Cancellation terms follow the listing policy at the time of booking.</li>
                </>
              )}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/account/trips/${encodeURIComponent(booking.code || id)}`}
                className={
                  isConfirmed
                    ? "inline-flex rounded-lg bg-[#2d6a4f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#245a43]"
                    : "inline-flex rounded-lg bg-[#374151] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1f2937]"
                }
              >
                Open trip details
              </Link>
              <Link
                href="/properties"
                className="inline-flex rounded-lg border border-[#cfd8d3] bg-white px-5 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f4f6f5]"
              >
                Find another stay
              </Link>
            </div>
          </section>
        </div>
      ) : (
        <p className="text-sm text-[#6b7280]">Loading confirmation…</p>
      )}
    </BookingFlowShell>
  );
}
