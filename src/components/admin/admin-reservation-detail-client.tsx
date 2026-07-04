"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookingChangeRequestPanel } from "@/components/booking/booking-change-request-panel";
import { BookingChargesBreakdown } from "@/components/booking/booking-charges-breakdown";
import { BookingPaymentHistory } from "@/components/booking/booking-payment-history";
import { OpenBookingThreadButton } from "@/components/messaging/open-booking-thread-button";
import { apiPost, ApiError } from "@/lib/api/client";
import { computeCancellation } from "@/lib/bookings/cancellation";
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
import {
  formatBookingStatus,
  isBookingCancelled,
  isBookingTerminal,
} from "@/lib/bookings/status";
import { formatDate, formatMoney } from "@/lib/format";

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

export function AdminBookingDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "decline" | "cancel">(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: async () => {
      const res = await fetch(
        `/api/bookings?scope=admin&id=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("booking");
      const j = (await res.json()) as { bookings: GuestBookingWithListing[] };
      return j.bookings[0] ?? null;
    },
  });

  const refundPreview = useMemo(() => {
    if (!data) return null;
    const cashPaid = Math.max(
      0,
      (data.total_cents ?? 0) - (data.credit_applied_cents ?? 0),
    );
    const creditPaid = Math.max(0, data.credit_applied_cents ?? 0);
    return computeCancellation({
      rules: [{ hours_before: 0, refund_pct: 100 }],
      checkIn: new Date(`${data.check_in}T00:00:00Z`),
      cashPaidCents: cashPaid,
      creditPaidCents: creditPaid,
    });
  }, [data]);

  if (isPending) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-48 rounded-md bg-muted" />
        <div className="h-48 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-12 text-center">
        <p className="text-sm text-[#5f6b66]">
          We couldn&apos;t load this reservation.{" "}
          <Link
            href="/admin/bookings"
            className="font-semibold text-[#1d6fb8] hover:underline"
          >
            Back to reservations
          </Link>
        </p>
      </div>
    );
  }

  const isRequest = data.status === "requested";
  const canCancel = !isBookingTerminal(data.status);
  const cancelled = isBookingCancelled(data.status);

  const title = bookingStayTitle(data);
  const { street, cityLine } = bookingAddressLines(data);
  const mapsUrl = bookingMapsUrl(data);
  const listingHref = bookingListingHref(data);
  const thumb = bookingThumbnail(data) ?? FALLBACK_IMG;
  const breakdown = parsePricingBreakdown(data.pricing_breakdown);
  const policyLabel =
    data.cancellation_policy_snapshot?.label ?? "Cancellation policy";

  const guestName = data.guest_profile?.display_name?.trim() || "Guest";
  const adults = data.adults ?? 1;
  const children = data.children ?? 0;
  const guestSummary =
    adults || children
      ? `${adults} adult${adults === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`
      : "—";

  const sf = data.service_fee_cents ?? 0;
  const estPayout = Math.max(0, (data.total_cents ?? 0) - sf);

  async function approveRequest() {
    setBusy("approve");
    try {
      await apiPost(`/api/bookings/${encodeURIComponent(data?.code || id)}/approve`);
      toast.success("Request approved");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not approve");
    } finally {
      setBusy(null);
    }
  }

  async function declineRequest() {
    setBusy("decline");
    try {
      await apiPost(`/api/bookings/${encodeURIComponent(data?.code || id)}/decline`);
      toast.success("Request declined");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not decline");
    } finally {
      setBusy(null);
    }
  }

  async function cancelReservation() {
    setBusy("cancel");
    try {
      await apiPost(`/api/bookings/${encodeURIComponent(data?.code || id)}/cancel`, {
        reason: cancelReason.trim() || "Cancelled by admin",
      });
      toast.success("Reservation cancelled — full refund issued to guest");
      setCancelReason("");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {cancelled ? (
        <div className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] px-5 py-4">
          <p className="font-semibold text-[#92400e]">Reservation cancelled</p>
          <p className="mt-1 text-sm text-[#b45309]">
            {formatBookingStatus(data.status)}
            {data.cancelled_at
              ? ` · ${formatDate(data.cancelled_at, "en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`
              : ""}
            {data.cancellation_reason ? ` · ${data.cancellation_reason}` : ""}
          </p>
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-[#6b7280]">
        <Link href="/admin" className="hover:text-[#1d6fb8] hover:underline">
          Admin
        </Link>
        <span aria-hidden className="text-[#cbd5e1]">
          /
        </span>
        <Link href="/admin/bookings" className="hover:text-[#1d6fb8] hover:underline">
          Reservations
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
              <Link href={listingHref} className="font-medium text-[#1d6fb8] hover:underline">
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
            inboxBasePath="/admin/inbox"
            variant="outline"
            className="border-[#cfd8d3]"
          >
            Message guest
          </OpenBookingThreadButton>
          {canCancel && !isRequest ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-[#ea580c] text-[#c2410c] hover:bg-[#fff7ed]"
                  disabled={busy !== null}
                >
                  Cancel reservation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this reservation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {refundPreview ? (
                      <>
                        Admin cancellations issue a full refund to the guest:{" "}
                        <strong>
                          {formatMoney(refundPreview.cash_refund_cents, data.currency)}
                        </strong>{" "}
                        to card
                        {refundPreview.credit_refund_cents > 0 ? (
                          <>
                            {" "}
                            +{" "}
                            <strong>
                              {formatMoney(refundPreview.credit_refund_cents, data.currency)}
                            </strong>{" "}
                            in credits
                          </>
                        ) : null}
                        . This also cancels any Beds24 sync and cannot be undone.
                      </>
                    ) : (
                      "Admin cancellations refund the guest in full and cannot be undone."
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="cancel-reason">Reason (optional)</Label>
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Property unavailable, guest request…"
                    rows={3}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy === "cancel"}>
                    Keep reservation
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy === "cancel"}
                    onClick={(e) => {
                      e.preventDefault();
                      void cancelReservation();
                    }}
                  >
                    {busy === "cancel" ? (
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
          {isRequest ? (
            <section className="rounded-xl border border-[#fbd9a5] bg-[#fff7ed] p-5 md:p-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a3412]">
                Booking request
              </h2>
              <p className="mt-2 text-sm text-[#7c2d12]">
                Approve to confirm the stay (guest pays if required), or decline to reject the
                request without charging.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="bg-[#FF385C] text-white hover:bg-[#E31C5F]"
                  disabled={busy !== null}
                  onClick={() => void approveRequest()}
                >
                  {busy === "approve" ? "Approving…" : "Approve request"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void declineRequest()}
                >
                  {busy === "decline" ? "Declining…" : "Decline request"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-6 rounded-xl border border-[#e2e8e4] bg-[#fafcfb] p-5 md:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              Reservation summary
            </h2>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                Guest
              </p>
              <div className="grid grid-cols-2 gap-3 space-y-3 text-sm">
                <DetailRow label="Name" value={guestName} />
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
                <DetailRow label="Booked on" value={formatDate(data.created_at)} />
                <DetailRow label="Status" value={formatBookingStatus(data.status)} />
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
                        {formatMoney(data.credit_applied_cents ?? 0, data.currency)}
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
            maxGuests={bookingListing(data)?.unit_occupancy ?? undefined}
            variant="admin"
            current={{
              check_in: data.check_in,
              check_out: data.check_out,
              adults: data.adults ?? 1,
              children: data.children ?? 0,
              infants: data.infants ?? 0,
              pets: data.pets ?? 0,
              guest_notes: data.guest_notes ?? null,
              total_cents: data.total_cents ?? 0,
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
                totalCents={data.total_cents ?? 0}
                creditAppliedCents={data.credit_applied_cents}
                promoDiscountCents={data.promo_discount_cents}
                totalLabel="Guest paid"
              />
              {sf > 0 ? (
                <div className="flex justify-between gap-4 pt-2 text-sm text-[#374151]">
                  <span className="text-[#5f6b66]">Est. payout</span>
                  <span className="tabular-nums">{formatMoney(estPayout, data.currency)}</span>
                </div>
              ) : null}
              <p className="mt-4 text-xs text-[#9ca3af]">
                Totals reflect amounts recorded at checkout. Estimated payout is the guest total
                minus the recorded service fee; the actual Stripe payout may differ.
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
              <Link href="/admin/bookings">← All reservations</Link>
            </Button>
          </div>
        </div>

        {cancelled ? (
          <aside className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] p-5">
            <h3 className="text-sm font-semibold text-[#92400e]">Cancelled</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#78350f]">
              This reservation was cancelled. Refund details appear in payment history.
            </p>
          </aside>
        ) : canCancel && !isRequest ? (
          <aside className="rounded-xl border border-[#dfe6e1] bg-[#f4f6f5] p-5">
            <h3 className="text-sm font-semibold text-[#1e6a82]">{policyLabel}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5f6b66]">
              Admin cancellations always refund the guest in full (card payment and credits) and
              cancel any Beds24 sync, regardless of the listing&apos;s guest-facing cancellation
              policy.
            </p>
            {refundPreview ? (
              <p className="mt-3 text-sm text-[#1f2937]">
                Refund if cancelled now:{" "}
                <strong>
                  {formatMoney(refundPreview.cash_refund_cents, data.currency)}
                </strong>{" "}
                to card
                {refundPreview.credit_refund_cents > 0 ? (
                  <>
                    {" "}
                    +{" "}
                    <strong>
                      {formatMoney(refundPreview.credit_refund_cents, data.currency)}
                    </strong>{" "}
                    in credits
                  </>
                ) : null}
                .
              </p>
            ) : null}
            <p className="mt-4 text-xs text-[#9ca3af]">
              Need a different outcome? Message the guest first—small changes can often be resolved
              without a cancellation.
            </p>
          </aside>
        ) : !canCancel ? (
          <aside className="rounded-xl border border-[#dfe6e1] bg-[#f4f6f5] p-5">
            <h3 className="text-sm font-semibold text-[#1f2937]">
              {formatBookingStatus(data.status)}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5f6b66]">
              This reservation is no longer cancellable. Cancellation policy details no longer
              apply.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
        {label}
      </span>
      <span className="text-[#1f2937]">{value}</span>
    </div>
  );
}
