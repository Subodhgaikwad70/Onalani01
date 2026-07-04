"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { BookingChangeRequestPanel } from "@/components/booking/booking-change-request-panel";
import { BookingChargesBreakdown } from "@/components/booking/booking-charges-breakdown";
import { BookingPaymentHistory } from "@/components/booking/booking-payment-history";
import { LeaveReviewDialog } from "@/components/account/leave-review-dialog";
import { OpenBookingThreadButton } from "@/components/messaging/open-booking-thread-button";
import { ApiError, apiPost } from "@/lib/api/client";
import {
  computeCancellation,
  type CancellationRule,
} from "@/lib/bookings/cancellation";
import { getCancellationPolicyDisplay } from "@/lib/bookings/cancellation-policies";
import {
  bookingAddressLines,
  bookingListingHref,
  bookingListing,
  bookingMapsUrl,
  bookingStayTitle,
  bookingThumbnail,
  parsePricingBreakdown,
  type GuestBookingWithListing,
} from "@/lib/bookings/display";
import type { PaymentHistoryEntry } from "@/lib/bookings/payment-history-display";
import {
  formatBookingStatus,
  isBookingCancelled,
  isBookingTerminal,
} from "@/lib/bookings/status";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPaymentCardLabel } from "@/lib/stripe/payment-card";
import { canGuestReviewListing } from "@/lib/reviews/eligibility";
import { useSupabaseSession } from "@/lib/supabase/session-context";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=1200&q=85";

function formatLong(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function TripDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useSupabaseSession();
  const [reviewOpen, setReviewOpen] = useState(
    () => searchParams.get("review") === "1",
  );
  const [cancelling, setCancelling] = useState(false);

  const { data, refetch, isPending } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () => {
      const res = await fetch(
        `/api/bookings?id=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("trip");
      const j = (await res.json()) as { bookings: GuestBookingWithListing[] };
      return j.bookings[0] ?? null;
    },
  });

  const { data: paymentHistory } = useQuery({
    queryKey: ["booking-payments", id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/payment-history`, {
        credentials: "include",
      });
      if (!res.ok) return [] as PaymentHistoryEntry[];
      const j = (await res.json()) as { entries: PaymentHistoryEntry[] };
      return j.entries;
    },
    enabled: data != null && data.status !== "pending_payment",
  });

  const canReview = useMemo(() => {
    if (!data) return false;
    return canGuestReviewListing(data, {
      hasExistingReview: data.guest_listing_review_submitted,
    });
  }, [data]);

  useEffect(() => {
    const code = data?.code?.trim();
    if (!code || code === id) return;
    const query = searchParams.toString();
    router.replace(
      `/account/trips/${encodeURIComponent(code)}${query ? `?${query}` : ""}`,
    );
  }, [data?.code, id, router, searchParams]);

  const preview = useMemo(() => {
    if (!data || isBookingTerminal(data.status)) return null;
    const snap = data.cancellation_policy_snapshot;
    const rules =
      snap?.rules && Array.isArray(snap.rules)
        ? snap.rules
        : [{ hours_before: 0, refund_pct: 0 }];
    const cashPaid = Math.max(
      0,
      data.total_cents - (data.credit_applied_cents ?? 0),
    );
    const creditPaid = Math.max(0, data.credit_applied_cents ?? 0);
    return computeCancellation({
      rules: rules as CancellationRule[],
      checkIn: new Date(`${data.check_in}T00:00:00Z`),
      cashPaidCents: cashPaid,
      creditPaidCents: creditPaid,
    });
  }, [data]);

  const refundTotals = useMemo(() => {
    if (!paymentHistory?.length) return null;
    const cash = paymentHistory
      .filter((e) => e.kind === "refund")
      .reduce((sum, e) => sum + Math.abs(e.amount_cents), 0);
    const credits = paymentHistory
      .filter((e) => e.kind === "credit_refund")
      .reduce((sum, e) => sum + Math.abs(e.amount_cents), 0);
    if (cash === 0 && credits === 0) return null;
    return { cash, credits };
  }, [paymentHistory]);

  async function cancelTrip() {
    setCancelling(true);
    try {
      const result = await apiPost<{
        ok?: boolean;
        refund_failed?: boolean;
        refund_error?: string | null;
      }>(`/api/bookings/${encodeURIComponent(data?.code || id)}/cancel`, {
        reason: "Guest cancelled",
      });
      if (result.refund_failed) {
        toast.warning(
          result.refund_error
            ? `Booking cancelled, but refund failed: ${result.refund_error}`
            : "Booking cancelled, but we could not process your refund automatically. Support will follow up.",
        );
      } else {
        toast.success("Booking cancelled");
      }
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings-dash"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-payments", id] });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not cancel");
    } finally {
      setCancelling(false);
    }
  }

  if (isPending) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-48 rounded-md bg-muted" />
        <div className="h-48 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-12 text-center">
        <p className="text-sm text-[#5f6b66]">
          We couldn&apos;t load this reservation.{" "}
          <Link
            href="/account/trips"
            className="font-semibold text-[#1d6fb8] hover:underline"
          >
            Back to trips
          </Link>
        </p>
      </div>
    );
  }

  const canCancel = !isBookingTerminal(data.status);
  const cancelled = isBookingCancelled(data.status);

  const title = bookingStayTitle(data);
  const { street, cityLine } = bookingAddressLines(data);
  const mapsUrl = bookingMapsUrl(data);
  const listingHref = bookingListingHref(data);
  const thumb = bookingThumbnail(data) ?? FALLBACK_IMG;
  const breakdown = parsePricingBreakdown(data.pricing_breakdown);
  const policyKey = data.cancellation_policy_snapshot?.key ?? null;
  const policyDisplay = getCancellationPolicyDisplay(policyKey);
  const policyLabel = data.cancellation_policy_snapshot?.label ?? policyDisplay.label;
  const paymentCardLabel = formatPaymentCardLabel(
    data.payment_card_last4,
    data.payment_card_brand,
  );
  const cashPaidCents = Math.max(
    0,
    data.total_cents - (data.credit_applied_cents ?? 0),
  );

  const adults = data.adults ?? 1;
  const children = data.children ?? 0;
  const guestSummary =
    adults || children
      ? `${adults} adult${adults === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`
      : "—";

  return (
    <div className="space-y-8">
      {cancelled ? (
        <div className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] px-5 py-4">
          <p className="font-semibold text-[#92400e]">
            This reservation was cancelled
          </p>
          <p className="mt-1 text-sm text-[#b45309]">
            {data.cancelled_at
              ? `Cancelled on ${formatDate(data.cancelled_at, "en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`
              : `Status: ${formatBookingStatus(data.status)}`}
            {data.cancellation_reason ? ` · ${data.cancellation_reason}` : null}
          </p>
          {refundTotals ? (
            <p className="mt-2 text-sm text-[#78350f]">
              Refunded{" "}
              {refundTotals.cash > 0 ? (
                <strong>{formatMoney(refundTotals.cash, data.currency)}</strong>
              ) : null}
              {refundTotals.cash > 0 && refundTotals.credits > 0
                ? " cash + "
                : null}
              {refundTotals.credits > 0 ? (
                <strong>
                  {formatMoney(refundTotals.credits, data.currency)}
                </strong>
              ) : null}
              {refundTotals.credits > 0 && refundTotals.cash === 0
                ? " in credits"
                : null}
              {refundTotals.cash > 0 && paymentCardLabel
                ? ` to ${paymentCardLabel}`
                : null}
              . Card refunds usually post in 5–10 business days.
            </p>
          ) : null}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-[#6b7280]">
        <Link href="/account" className="hover:text-[#1d6fb8] hover:underline">
          Account
        </Link>
        <span aria-hidden className="text-[#cbd5e1]">
          /
        </span>
        <Link
          href="/account/trips"
          className="hover:text-[#1d6fb8] hover:underline"
        >
          Trips
        </Link>
        <span aria-hidden className="text-[#cbd5e1]">
          /
        </span>
        <span className="font-mono text-[#374151]">{data.code}</span>
      </nav>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt=""
        className="h-52 w-full rounded-xl object-cover shadow-inner md:h-64"
      />

      <header className="flex flex-col gap-4 border-b border-[#eceeec] pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {listingHref ? (
            <Link
              href={listingHref}
              className="inline-flex items-center gap-1 font-(family-name:--font-lora) text-2xl font-semibold text-[#1d6fb8] hover:underline md:text-3xl"
            >
              {title}
              <span aria-hidden className="text-xl">
                ›
              </span>
            </Link>
          ) : (
            <h1 className="font-(family-name:--font-lora) text-2xl font-semibold text-[#1e6a82] md:text-3xl">
              {title}
            </h1>
          )}
          {(street || cityLine) && (
            <p className="text-sm text-[#5f6b66]">
              {[street, cityLine].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#1d6fb8] hover:underline"
              >
                View on map
              </a>
            ) : null}
            {listingHref ? (
              <Link
                href={listingHref}
                className="font-medium text-[#1d6fb8] hover:underline"
              >
                View listing
              </Link>
            ) : null}
          </div>
          <div className="pt-2 text-sm leading-relaxed text-[#374151]">
            <p>
              <span className="font-semibold text-[#1f2937]">Check-in:</span>{" "}
              {formatLong(data.check_in)}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-[#1f2937]">Check-out:</span>{" "}
              {formatLong(data.check_out)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <OpenBookingThreadButton
            bookingId={data.id}
            inboxBasePath="/account/messages"
            variant="outline"
            className="border-[#cfd8d3]"
          >
            Message host
          </OpenBookingThreadButton>
          {canReview ? (
            <LeaveReviewDialog
              bookingId={data.id}
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              onSubmitted={() => void refetch()}
              trigger={<Button>Leave review</Button>}
            />
          ) : data.guest_listing_review_submitted ? (
            <p className="text-sm font-medium text-[#6b7280]">
              Review submitted
            </p>
          ) : null}
          {canCancel ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-[#ea580c] text-[#c2410c] hover:bg-[#fff7ed]"
                >
                  Cancel reservation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {preview ? (
                      <>
                        Estimated refund if you cancel now (
                        {preview.days_to_check_in} days before check-in):
                        <ul className="mt-2 list-inside list-disc space-y-1 text-left">
                          {preview.cash_refund_cents > 0 ? (
                            <li>
                              <strong>
                                {formatMoney(
                                  preview.cash_refund_cents,
                                  data.currency,
                                )}
                              </strong>{" "}
                              cash
                              {preview.cash_refund_cents > 0 && paymentCardLabel
                                ? ` to ${paymentCardLabel}`
                                : null}
                              {preview.processing_fee_cents > 0
                                ? ` (includes ${formatMoney(preview.processing_fee_cents, data.currency)} processing fee)`
                                : null}
                            </li>
                          ) : null}
                          {preview.credit_refund_cents > 0 ? (
                            <li>
                              <strong>
                                {formatMoney(
                                  preview.credit_refund_cents,
                                  data.currency,
                                )}
                              </strong>{" "}
                              credits returned from your booking balance
                            </li>
                          ) : null}
                          {preview.guaranteed_credit_cents > 0 ? (
                            <li>
                              <strong>
                                {formatMoney(
                                  preview.guaranteed_credit_cents,
                                  data.currency,
                                )}
                              </strong>{" "}
                              guaranteed travel credits
                            </li>
                          ) : null}
                          {preview.recovery_entitlement_cents > 0 ? (
                            <li>
                              Up to{" "}
                              <strong>
                                {formatMoney(
                                  preview.recovery_entitlement_cents,
                                  data.currency,
                                )}
                              </strong>{" "}
                              recovery credits if dates rebook
                            </li>
                          ) : null}
                          {preview.cash_refund_cents === 0 &&
                          preview.credit_refund_cents === 0 &&
                          preview.guaranteed_credit_cents === 0 &&
                          preview.recovery_entitlement_cents === 0 ? (
                            <li>No refund under the current policy window.</li>
                          ) : null}
                        </ul>
                        Card refunds usually post in 5–10 business days.
                      </>
                    ) : (
                      "Refund amounts depend on your cancellation policy."
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelling}>
                    Keep reservation
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={cancelling}
                    onClick={(e) => {
                      e.preventDefault();
                      void cancelTrip();
                    }}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelling…
                      </>
                    ) : (
                      "Confirm cancel"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
        <div className="space-y-6">
          <section className="space-y-6 rounded-xl border border-[#e2e8e4] bg-[#fafcfb] p-5 md:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              Reservation summary
            </h2>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                Guest
              </p>
              <div className="grid grid-cols-2 gap-3 space-y-3 text-sm">
                <DetailRow label="Traveler" value={user?.email ?? "—"} />
                <DetailRow label="Guests" value={guestSummary} />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                Reservation
              </p>
              <div className="grid grid-cols-2 gap-3 space-y-3 text-sm">
                <DetailRow
                  label="Confirmation #"
                  value={<span className="font-mono">{data.code}</span>}
                />
                <DetailRow
                  label="Booked on"
                  value={formatDate(data.created_at)}
                />
                <DetailRow
                  label="Status"
                  value={formatBookingStatus(data.status)}
                />
                {cancelled && data.cancelled_at ? (
                  <DetailRow
                    label="Cancelled on"
                    value={formatDate(data.cancelled_at, "en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  />
                ) : null}
                {cancelled && data.cancellation_reason ? (
                  <DetailRow
                    label="Cancellation reason"
                    value={data.cancellation_reason}
                  />
                ) : null}
                {breakdown?.nights != null ? (
                  <DetailRow label="Nights" value={String(breakdown.nights)} />
                ) : null}
                {(data.credit_applied_cents ?? 0) > 0 ? (
                  <DetailRow
                    label="Credits used at booking"
                    value={
                      <span className="font-medium text-emerald-800">
                        {formatMoney(
                          data.credit_applied_cents ?? 0,
                          data.currency,
                        )}
                      </span>
                    }
                  />
                ) : null}
              </div>
            </div>
          </section>

          <BookingChangeRequestPanel
            bookingId={data.code || id}
            availabilityBookingId={data.id}
            bookingStatus={data.status}
            listingSlug={bookingListing(data)?.slug}
            listingMinNights={bookingListing(data)?.min_nights}
            listingMaxNights={bookingListing(data)?.max_nights}
            variant="guest"
            maxGuests={bookingListing(data)?.unit_occupancy ?? undefined}
            current={{
              check_in: data.check_in,
              check_out: data.check_out,
              adults: data.adults ?? 1,
              children: data.children ?? 0,
              infants: data.infants ?? 0,
              pets: data.pets ?? 0,
              guest_notes: data.guest_notes ?? null,
              total_cents: data.total_cents,
              currency: data.currency,
            }}
            onUpdated={() => void refetch()}
          />

          <section className="rounded-xl border border-[#e2e8e4] bg-white p-5 md:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              Charges
            </h2>
            <div className="mt-4">
              <BookingChargesBreakdown
                breakdown={breakdown}
                currency={data.currency}
                totalCents={data.total_cents}
                creditAppliedCents={data.credit_applied_cents}
                promoDiscountCents={data.promo_discount_cents}
              />
              {paymentCardLabel && cashPaidCents > 0 ? (
                <div className="mt-2 flex justify-between gap-4 border-t border-[#eceeec] pt-4 text-sm">
                  <span className="text-[#5f6b66]">Paid with</span>
                  <span className="font-medium tabular-nums text-[#1f2937]">
                    {paymentCardLabel}
                  </span>
                </div>
              ) : null}
              <p className="mt-4 text-xs text-[#9ca3af]">
                Totals reflect amounts recorded at checkout. Card charges may
                appear as separate line items from your bank.
              </p>
            </div>
          </section>

          {data.status !== "pending_payment" ? (
            <section className="rounded-xl border border-[#e2e8e4] bg-white p-5 md:p-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
                Payment history
              </h2>
              <div className="mt-4">
                <BookingPaymentHistory bookingId={data.code || id} />
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/trips">← All trips</Link>
            </Button>
          </div>
        </div>

        {cancelled ? (
          <aside className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] p-5">
            <h3 className="text-sm font-semibold text-[#92400e]">
              Cancellation
            </h3>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-[#78350f]">
              <p>
                This stay was cancelled
                {data.cancelled_at
                  ? ` on ${formatDate(data.cancelled_at, "en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}`
                  : ""}
                .
              </p>
              {refundTotals ? (
                <p>
                  Refund issued:{" "}
                  {refundTotals.cash > 0 ? (
                    <strong>
                      {formatMoney(refundTotals.cash, data.currency)}
                    </strong>
                  ) : null}
                  {refundTotals.cash > 0 && refundTotals.credits > 0
                    ? " + "
                    : null}
                  {refundTotals.credits > 0 ? (
                    <>
                      <strong>
                        {formatMoney(refundTotals.credits, data.currency)}
                      </strong>{" "}
                      credits
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                <p>No refund was recorded for this cancellation.</p>
              )}
              {data.cancellation_reason ? (
                <p className="text-xs text-[#b45309]">
                  Reason: {data.cancellation_reason}
                </p>
              ) : null}
            </div>
          </aside>
        ) : canCancel ? (
          <aside className="space-y-4 rounded-xl border border-[#dfe6e1] bg-[#f4f6f5] p-5">
            <div>
              <h3 className="text-sm font-semibold text-[#1e6a82]">
                {policyLabel}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#5f6b66]">
                {policyDisplay.tagline}
              </p>
            </div>
            {preview ? (
              <div className="rounded-lg border border-[#dfe6e1] bg-white p-3 text-sm text-[#374151]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">
                  If you cancel now ({preview.days_to_check_in} days out)
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {preview.cash_refund_cents > 0 ? (
                    <li>
                      Cash:{" "}
                      <strong>
                        {formatMoney(preview.cash_refund_cents, data.currency)}
                      </strong>
                    </li>
                  ) : null}
                  {preview.guaranteed_credit_cents > 0 ? (
                    <li>
                      Guaranteed credits:{" "}
                      <strong>
                        {formatMoney(
                          preview.guaranteed_credit_cents,
                          data.currency,
                        )}
                      </strong>
                    </li>
                  ) : null}
                  {preview.recovery_entitlement_cents > 0 ? (
                    <li className="text-[#5f6b66]">
                      Recovery credits (if rebooked): up to{" "}
                      {formatMoney(
                        preview.recovery_entitlement_cents,
                        data.currency,
                      )}
                    </li>
                  ) : null}
                  {preview.cash_refund_cents === 0 &&
                  preview.guaranteed_credit_cents === 0 &&
                  !preview.recovery_entitlement_cents ? (
                    <li className="text-amber-800">No refund in this window.</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <ul className="space-y-1.5 text-xs text-[#5f6b66]">
              {policyDisplay.tiers.map((tier) => (
                <li key={tier.windowLabel}>
                  <span className="font-medium text-[#374151]">
                    {tier.windowLabel}:
                  </span>{" "}
                  {tier.cashRefund !== "None" ? (
                    <span className="text-emerald-700">
                      {tier.cashRefund} cash
                    </span>
                  ) : (
                    <span className="text-amber-700">No cash</span>
                  )}
                  {tier.creditIssued !== "None needed" ? (
                    <> · {tier.creditIssued}</>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#9ca3af]">
              Need to change dates? Message your host—they may be able to adjust
              your stay before you cancel.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
        {label}
      </span>
      <span className="text-[#1f2937]">{value}</span>
    </div>
  );
}
