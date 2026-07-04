"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookingFlowShell } from "@/components/booking/booking-flow-shell";
import { CancellationRateSelector } from "@/components/booking/cancellation-rate-selector";
import { BookingGuestStepper } from "@/components/booking/booking-guest-stepper";
import {
  BookingStaySummary,
  type BookingListingSummary,
} from "@/components/booking/booking-stay-summary";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api/client";
import type { PricingBreakdown } from "@/lib/bookings/pricing";
import {
  GUEST_CHECKOUT_DEFAULT_POLICY_KEY,
  isCancellationPolicyKey,
  type CancellationPolicyKey,
  type CancellationRateOption,
} from "@/lib/bookings/cancellation-policies";
import { formatMoney } from "@/lib/format";
import { useSupabaseSession } from "@/lib/supabase/session-context";

type QuoteResponse = {
  quote: PricingBreakdown;
  cancellation_policy_key?: string;
  rate_options?: CancellationRateOption[];
};

type BookingCreateResponse = {
  booking: { id: string; code?: string | null; status: string; total_cents?: number };
  client_secret: string | null;
  checkout_session_id?: string | null;
  requires_checkout?: boolean;
};

function guestSummary(adults: number, children: number, infants: number, pets: number) {
  const parts = [
    `${adults} adult${adults === 1 ? "" : "s"}`,
    children > 0 ? `${children} child${children === 1 ? "" : "ren"}` : null,
    infants > 0 ? `${infants} infant${infants === 1 ? "" : "s"}` : null,
    pets > 0 ? `${pets} pet${pets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function BookListingClient({
  slug,
  listing,
  initialCheckIn,
  initialCheckOut,
  initialAdults,
  initialChildren,
  maxGuests,
  instantBookEnabled,
  initialCancellationPolicy,
}: {
  slug: string;
  listing: BookingListingSummary;
  initialCheckIn: string;
  initialCheckOut: string;
  initialAdults: number;
  initialChildren: number;
  maxGuests?: number | null;
  instantBookEnabled: boolean;
  initialCancellationPolicy?: string | null;
}) {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSupabaseSession();
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [adults, setAdults] = useState(initialAdults);
  const [childrenCount, setChildrenCount] = useState(initialChildren);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [notes, setNotes] = useState("");
  const [applyCredits, setApplyCredits] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<CancellationPolicyKey>(
    isCancellationPolicyKey(initialCancellationPolicy)
      ? initialCancellationPolicy
      : GUEST_CHECKOUT_DEFAULT_POLICY_KEY,
  );

  const totalGuests = adults + childrenCount;
  const guestLabel = guestSummary(adults, childrenCount, infants, pets);
  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (checkIn) params.set("check_in", checkIn);
    if (checkOut) params.set("check_out", checkOut);
    params.set("adults", String(adults));
    params.set("children", String(childrenCount));
    const query = params.toString();
    const next = `/listings/${slug}/book${query ? `?${query}` : ""}`;
    return `/auth/login?next=${encodeURIComponent(next)}`;
  }, [adults, checkIn, checkOut, childrenCount, slug]);

  const quoteEnabled =
    !!checkIn &&
    !!checkOut &&
    checkOut > checkIn &&
    adults >= 1;

  const { data: quoteData, isFetching: quoteLoading } = useQuery({
    queryKey: [
      "quote",
      slug,
      checkIn,
      checkOut,
      adults,
      childrenCount,
      infants,
      pets,
      selectedPolicyKey,
    ],
    enabled: quoteEnabled,
    queryFn: async () => {
      const res = await fetch("/api/bookings/quote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_slug: slug,
          check_in: checkIn,
          check_out: checkOut,
          guests: { adults, children: childrenCount, infants, pets },
          cancellation_policy_key: selectedPolicyKey,
        }),
      });
      if (!res.ok) throw new Error("quote failed");
      return res.json() as Promise<QuoteResponse>;
    },
  });

  const quote = quoteData?.quote;
  const rateOptions = quoteData?.rate_options ?? [];

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    enabled: !!user?.email,
    queryFn: async () => {
      const res = await fetch("/api/guests/me/credits?include=balances", {
        credentials: "include",
      });
      if (res.status === 401) return { balances: {} };
      if (!res.ok) throw new Error("credits");
      return res.json() as Promise<{ balances: Record<string, number> }>;
    },
  });

  const currency = quote?.currency ?? "USD";
  const balance = credits?.balances?.[currency] ?? 0;

  const maxApplicableCredit = useMemo(() => {
    if (!quote) return 0;
    const afterPromo = Math.max(0, quote.total_cents - (promoDiscount ?? 0));
    return Math.min(balance, afterPromo);
  }, [quote, promoDiscount, balance]);

  const creditMax = applyCredits ? maxApplicableCredit : 0;

  const previewTotal = useMemo(() => {
    if (!quote) return null;
    const afterPromo = Math.max(0, quote.total_cents - (promoDiscount ?? 0));
    const applied = Math.min(creditMax, balance, afterPromo);
    return Math.max(0, afterPromo - applied);
  }, [quote, promoDiscount, creditMax, balance]);

  async function applyPromo() {
    if (!promoCode.trim() || !quote) {
      toast.error("Enter a promo code after loading a quote");
      return;
    }
    try {
      const res = await fetch("/api/promos/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode.trim(),
          subtotal_cents: quote.subtotal_cents,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error?.message ?? "Invalid promo");
        return;
      }
      setPromoDiscount(j.discount_cents as number);
      toast.success("Promo applied");
    } catch {
      toast.error("Could not validate promo");
    }
  }

  async function confirm() {
    if (!quote || !user?.email) return;
    setSubmitting(true);
    try {
      const body = {
        listing_slug: slug,
        check_in: checkIn,
        check_out: checkOut,
        guests: { adults, children: childrenCount, infants, pets },
        guest_notes: notes || null,
        credit_apply_max_cents: Math.min(
          creditMax,
          balance,
          quote.total_cents - (promoDiscount ?? 0),
        ),
        promo_code: promoCode.trim() || null,
        cancellation_policy_key: selectedPolicyKey,
      };
      const res = await apiPost<BookingCreateResponse>("/api/bookings", body);
      const needsCheckout =
        res.requires_checkout ??
        ((res.booking.status === "pending_payment" &&
          (res.booking.total_cents ?? previewTotal ?? 0) > 0) ||
          Boolean(res.client_secret || res.checkout_session_id));

      toast.success(
        needsCheckout ? "Continue to payment" : "Request sent to host",
      );
      const bookingIdentifier = res.booking.code || res.booking.id;
      if (needsCheckout) {
        router.push(`/checkout/${bookingIdentifier}`);
      } else {
        router.push(`/bookings/${bookingIdentifier}/confirmation`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  const panelClass =
    "rounded-2xl border border-[#dfe6e1] bg-white p-5 shadow-sm md:p-6";

  return (
    <BookingFlowShell
      step="review"
      backHref={`/listings/${slug}`}
      backLabel="Back to listing"
      title="Review your reservation"
      subtitle="Confirm dates, guests, and pricing before continuing to secure payment."
      sidebar={
        <BookingStaySummary
          listing={listing}
          checkIn={checkIn}
          checkOut={checkOut}
          guestLabel={guestLabel}
          quote={quote}
          promoDiscount={promoDiscount}
          creditApplied={creditMax}
          totalDue={previewTotal}
          loading={quoteLoading && quoteEnabled}
        />
      }
    >
      {sessionLoading ? (
        <p className="text-sm text-[#6b7280]">Loading session…</p>
      ) : !user?.email ? (
        <div className={`${panelClass} border-[#cfd8d3] bg-[#fafcfb]`}>
          <p className="text-sm font-semibold text-[#1f2937]">Sign in to book</p>
          <p className="mt-2 text-sm text-[#5f6b66]">
            Log in or create an account to complete your reservation.
          </p>
          <Link
            href={loginHref}
            className="mt-4 inline-flex rounded-lg bg-[#2d6a4f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#245a43]"
          >
            Log in to continue
          </Link>
        </div>
      ) : null}

      <section className={panelClass}>
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
          Dates
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="check-in" className="text-[#374151]">
              Check-in
            </Label>
            <Input
              id="check-in"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="border-[#cfd8d3] bg-[#fafcfb]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check-out" className="text-[#374151]">
              Check-out
            </Label>
            <Input
              id="check-out"
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(e) => setCheckOut(e.target.value)}
              className="border-[#cfd8d3] bg-[#fafcfb]"
            />
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
          Guests
        </h2>
        <div className="mt-2 divide-y divide-[#eceeec]">
          <BookingGuestStepper
            label="Adults"
            value={adults}
            minimum={1}
            maximum={maxGuests != null ? maxGuests - childrenCount : undefined}
            onDecrease={() => setAdults((n) => Math.max(1, n - 1))}
            onIncrease={() => {
              if (maxGuests != null && totalGuests >= maxGuests) return;
              setAdults((n) => n + 1);
            }}
          />
          <BookingGuestStepper
            label="Children"
            value={childrenCount}
            minimum={0}
            maximum={maxGuests != null ? maxGuests - adults : undefined}
            onDecrease={() => setChildrenCount((n) => Math.max(0, n - 1))}
            onIncrease={() => {
              if (maxGuests != null && totalGuests >= maxGuests) return;
              setChildrenCount((n) => n + 1);
            }}
          />
          <BookingGuestStepper
            label="Infants"
            value={infants}
            minimum={0}
            onDecrease={() => setInfants((n) => Math.max(0, n - 1))}
            onIncrease={() => setInfants((n) => n + 1)}
          />
          <BookingGuestStepper
            label="Pets"
            value={pets}
            minimum={0}
            onDecrease={() => setPets((n) => Math.max(0, n - 1))}
            onIncrease={() => setPets((n) => n + 1)}
          />
        </div>
        {maxGuests != null ? (
          <p className="mt-3 text-xs text-[#9ca3af]">Maximum {maxGuests} guests</p>
        ) : null}
      </section>

      <section className={panelClass}>
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
          Notes for the host
        </h2>
        <Textarea
          className="mt-4 min-h-[88px] border-[#cfd8d3] bg-[#fafcfb]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Late arrival, celebration, accessibility needs, etc. (optional)"
        />
      </section>

      {user?.email && quoteEnabled ? (
        <section className={panelClass}>
          <CancellationRateSelector
            options={rateOptions}
            selectedKey={selectedPolicyKey}
            onSelect={(key) =>
              setSelectedPolicyKey(key as CancellationPolicyKey)
            }
            currency={quote?.currency ?? "USD"}
            nights={quote?.nights}
            loading={quoteLoading}
          />
        </section>
      ) : null}

      {user?.email && quote ? (
        <section className={`${panelClass} bg-[#fafcfb]`}>
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Credits &amp; promos
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe6e1] bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#1f2937]">Credit balance</p>
                <p className="text-lg font-semibold tabular-nums text-[#143328]">
                  {formatMoney(balance, currency)}
                </p>
              </div>
              {balance > 0 ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#374151]">
                  <input
                    type="checkbox"
                    checked={applyCredits}
                    onChange={(e) => setApplyCredits(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cfd8d3] accent-[#2d6a4f]"
                  />
                  Apply credits
                </label>
              ) : null}
            </div>
            {applyCredits && maxApplicableCredit > 0 ? (
              <p className="text-sm text-[#5f6b66]">
                Applying up to{" "}
                <strong>{formatMoney(maxApplicableCredit, currency)}</strong> toward
                this stay.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="border-[#cfd8d3] bg-white"
              />
              <button
                type="button"
                onClick={applyPromo}
                className="shrink-0 rounded-lg border border-[#cfd8d3] bg-white px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f4f6f5]"
              >
                Apply promo
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        <button
          type="button"
          disabled={!quote || !user?.email || submitting}
          onClick={confirm}
          className="w-full rounded-xl bg-[#2d6a4f] py-3.5 text-sm font-bold text-white transition hover:bg-[#245a43] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Processing…"
            : (previewTotal ?? quote?.total_cents ?? 0) > 0
              ? "Continue to payment"
              : instantBookEnabled
                ? "Confirm reservation"
                : "Send booking request"}
        </button>
        <p className="text-center text-xs text-[#9ca3af]">
          {(previewTotal ?? quote?.total_cents ?? 0) > 0
            ? "Payment is collected on the next step before your request is sent to the host."
            : instantBookEnabled
              ? "No payment due for this stay."
              : "Your request will be sent to the host for approval."}
        </p>
      </div>
    </BookingFlowShell>
  );
}
