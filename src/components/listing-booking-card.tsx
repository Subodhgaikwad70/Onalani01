"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { addCalendarDay } from "@/lib/calendar/dates";
import {
  allNightsAvailableInRange,
  eachOccupiedNightIso,
  earliestValidCheckOutExclusive,
  isCheckInSelectable,
  requiredMinNightsForCheckIn,
  type PublicAvailabilityPayload,
  validateStayAgainstSlice,
} from "@/lib/booking/stay-validation";
import { formatMoney } from "@/lib/format";
import { CancellationRateSelector } from "@/components/booking/cancellation-rate-selector";
import {
  GUEST_CHECKOUT_DEFAULT_POLICY_KEY,
  type CancellationPolicyKey,
  type CancellationRateOption,
} from "@/lib/bookings/cancellation-policies";

function getNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatCurrencyDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

type AvailabilityApiResponse = PublicAvailabilityPayload & {
  currency?: string;
};

function resolveNightCents(
  apiCents: number | undefined,
  fallbackCents: number | null,
): number | null {
  if (typeof apiCents === "number" && apiCents > 0) return apiCents;
  if (fallbackCents != null && fallbackCents > 0) return fallbackCents;
  if (typeof apiCents === "number") return apiCents;
  return null;
}

export function ListingBookingCard({
  slug,
  nightlyRate,
  basePriceCents,
  currency = "USD",
  maxGuests,
  listingMinNights,
  listingMaxNights,
}: {
  slug: string;
  nightlyRate: number | null;
  basePriceCents?: number | null;
  currency?: string;
  maxGuests: number | null;
  listingMinNights?: number | null;
  listingMaxNights?: number | null;
}) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedPolicyKey, setSelectedPolicyKey] =
    useState<CancellationPolicyKey>(GUEST_CHECKOUT_DEFAULT_POLICY_KEY);
  const [month, setMonth] = useState(() => startOfDay(new Date()));

  const rangeBounds = useMemo(() => {
    const start = startOfDay(new Date());
    const from = format(start, "yyyy-MM-dd");
    const to = format(addDays(start, 549), "yyyy-MM-dd");
    return { from, to };
  }, []);

  const { data: availability, isLoading: availabilityLoading } = useQuery({
    queryKey: ["listing-availability", slug, rangeBounds.from, rangeBounds.to],
    queryFn: async (): Promise<AvailabilityApiResponse> => {
      const u = new URL("/api/availability", window.location.origin);
      u.searchParams.set("listing_slug", slug);
      u.searchParams.set("from", rangeBounds.from);
      u.searchParams.set("to", rangeBounds.to);
      const r = await fetch(u.toString());
      if (!r.ok) throw new Error("availability");
      return r.json() as Promise<AvailabilityApiResponse>;
    },
    staleTime: 60_000,
  });

  const nights = useMemo(() => getNights(checkIn, checkOut), [checkIn, checkOut]);
  const guests = adults + children;

  const stayCheck = useMemo(() => {
    if (!availability || !checkIn || !checkOut) return null;
    return validateStayAgainstSlice(availability, checkIn, checkOut, {
      listingMinNights,
      listingMaxNights,
    });
  }, [availability, checkIn, checkOut, listingMinNights, listingMaxNights]);

  const canReserve =
    Boolean(checkIn && checkOut && nights > 0) && stayCheck?.ok === true;

  const pricingCurrency = availability?.currency ?? currency;

  const { data: quoteData, isFetching: quoteLoading } = useQuery({
    queryKey: [
      "listing-quote",
      slug,
      checkIn,
      checkOut,
      adults,
      children,
      selectedPolicyKey,
    ],
    enabled: canReserve,
    queryFn: async () => {
      const res = await fetch("/api/bookings/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_slug: slug,
          check_in: checkIn,
          check_out: checkOut,
          guests: { adults, children, infants: 0, pets: 0 },
          cancellation_policy_key: selectedPolicyKey,
        }),
      });
      if (!res.ok) throw new Error("quote");
      return res.json() as Promise<{
        quote: { total_cents: number; currency: string; nights: number };
        rate_options: CancellationRateOption[];
      }>;
    },
    staleTime: 30_000,
  });

  const rateOptions = quoteData?.rate_options ?? [];
  const selectedTotalCents = quoteData?.quote.total_cents ?? null;
  const quoteCurrency = quoteData?.quote.currency ?? pricingCurrency;

  const todayIso = useMemo(
    () => format(startOfDay(new Date()), "yyyy-MM-dd"),
    [],
  );

  const fallbackNightCents =
    basePriceCents != null && basePriceCents > 0
      ? basePriceCents
      : nightlyRate != null
        ? Math.round(nightlyRate * 100)
        : null;

  const minCheckoutIso = useMemo(() => {
    if (!checkIn) return "";
    const minNights = availability
      ? requiredMinNightsForCheckIn(availability, checkIn, {
          listingMinNights,
          listingMaxNights,
        })
      : Math.max(1, listingMinNights ?? 1);
    return earliestValidCheckOutExclusive(checkIn, minNights);
  }, [availability, checkIn, listingMinNights, listingMaxNights]);

  const stayPricing = useMemo(() => {
    if (!availability || !checkIn || !checkOut || nights < 1) return null;
    const occ = eachOccupiedNightIso(checkIn, checkOut);
    let subtotalCents = 0;
    let missing = false;
    for (const d of occ) {
      const nightCents = resolveNightCents(
        availability.prices_cents?.[d],
        fallbackNightCents,
      );
      if (nightCents != null) subtotalCents += nightCents;
      else missing = true;
    }
    const serviceFeeCents = Math.round(subtotalCents * 0.08);
    return {
      subtotalCents,
      serviceFeeCents,
      totalCents: subtotalCents + serviceFeeCents,
      avgNightCents: Math.round(subtotalCents / nights),
      missing,
    };
  }, [availability, checkIn, checkOut, nights, fallbackNightCents]);

  const rangeSelected = useMemo((): DateRange | undefined => {
    if (!checkIn) return undefined;
    const from = parseISO(`${checkIn}T12:00:00`);
    if (!checkOut) return { from, to: undefined };
    const to = parseISO(`${checkOut}T12:00:00`);
    return { from, to };
  }, [checkIn, checkOut]);

  const disabledMatcher = useCallback(
    (date: Date) => {
      const iso = format(date, "yyyy-MM-dd");
      if (iso < todayIso) return true;
      if (iso < rangeBounds.from || iso >= rangeBounds.to) return true;
      if (!availability) return false;

      if (iso === todayIso && !isCheckInSelectable(availability, todayIso)) {
        return true;
      }

      const choosingCheckout = Boolean(checkIn && !checkOut);

      if (choosingCheckout) {
        if (iso <= checkIn) {
          return !isCheckInSelectable(availability, iso);
        }
        return !validateStayAgainstSlice(availability, checkIn, iso, {
          listingMinNights,
          listingMaxNights,
        }).ok;
      }

      return !isCheckInSelectable(availability, iso);
    },
    [
      availability,
      checkIn,
      checkOut,
      listingMinNights,
      listingMaxNights,
      rangeBounds.from,
      rangeBounds.to,
      todayIso,
    ],
  );

  const strikeThroughWhenDisabled = useCallback(
    (date: Date) => {
      if (!disabledMatcher(date)) return false;
      const iso = format(date, "yyyy-MM-dd");

      if (availability && checkIn && !checkOut && iso > checkIn) {
        if (allNightsAvailableInRange(availability, checkIn, iso)) {
          return false;
        }
      }

      return true;
    },
    [availability, checkIn, checkOut, disabledMatcher],
  );

  const calendarModifiers = useMemo(
    () => ({ strikeDisabled: strikeThroughWhenDisabled }),
    [strikeThroughWhenDisabled],
  );

  const onRangeSelect = useCallback((range: DateRange | undefined) => {
    if (!range?.from) {
      setCheckIn("");
      setCheckOut("");
      return;
    }
    const ci = format(range.from, "yyyy-MM-dd");
    if (!range.to) {
      setCheckIn(ci);
      setCheckOut("");
      return;
    }
    const co = format(range.to, "yyyy-MM-dd");
    // With min={0}, react-day-picker can set to === from on first click; treat as check-in only.
    if (co <= ci) {
      setCheckIn(ci);
      setCheckOut("");
      return;
    }
    setCheckIn(ci);
    setCheckOut(co);
  }, []);

  const bookHref = useMemo(() => {
    const params = new URLSearchParams();
    if (checkIn) params.set("check_in", checkIn);
    if (checkOut) params.set("check_out", checkOut);
    params.set("adults", String(adults));
    params.set("children", String(children));
    params.set("cancellation_policy", selectedPolicyKey);
    return `/listings/${slug}/book?${params.toString()}`;
  }, [adults, checkIn, checkOut, children, selectedPolicyKey, slug]);

  const updateGuestCount = (
    setter: (update: (current: number) => number) => void,
    direction: 1 | -1,
    minimum: number,
  ) => {
    setter((current) => {
      const next = Math.max(minimum, current + direction);
      if (maxGuests != null && direction > 0 && guests >= maxGuests) {
        return current;
      }
      return next;
    });
  };

  const headerRateLine = (() => {
    if (selectedTotalCents != null && nights > 0) {
      return (
        <>
          <p className="text-2xl font-semibold text-[#222222]">
            {formatMoney(selectedTotalCents, quoteCurrency)}
            <span className="text-base font-normal text-[#5c6360]">
              {" "}
              for {nights} night{nights === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-1 text-xs text-[#717171]">
            {rateOptions.find((o) => o.key === selectedPolicyKey)?.label ??
              "Selected rate"}
          </p>
        </>
      );
    }
    if (stayPricing && nights > 0) {
      return (
        <>
          <p className="text-2xl font-semibold text-[#222222]">
            {formatMoney(stayPricing.avgNightCents, pricingCurrency)}
            <span className="text-base font-normal text-[#5c6360]">
              {" "}
              / night avg
            </span>
          </p>
          <p className="mt-1 text-xs text-[#717171]">
            {nights} night{nights === 1 ? "" : "s"} ·{" "}
            {formatMoney(stayPricing.subtotalCents, pricingCurrency)} subtotal
            {stayPricing.missing ? " · some nights use listing default" : null}
          </p>
        </>
      );
    }
    if (checkIn && !checkOut && availability) {
      const c = resolveNightCents(
        availability.prices_cents?.[checkIn],
        fallbackNightCents,
      );
      if (c != null) {
        return (
          <>
            <p className="text-2xl font-semibold text-[#222222]">
              {formatMoney(c, pricingCurrency)}
              <span className="text-base font-normal text-[#5c6360]">
                {" "}
                / night
              </span>
            </p>
            <p className="mt-1 text-xs text-[#717171]">Check-in night · pick checkout</p>
          </>
        );
      }
    }
    if (nightlyRate != null) {
      return (
        <p className="text-2xl font-semibold text-[#222222]">
          {formatCurrencyDollars(nightlyRate)}
          <span className="text-base font-normal text-[#5c6360]"> night</span>
        </p>
      );
    }
    return <p className="text-xl font-semibold text-[#222222]">Rates on request</p>;
  })();

  return (
    <aside className="sticky top-6 rounded-2xl border border-[#dfe6e1] bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>{headerRateLine}</div>
        <p className="text-sm font-medium text-[#6b7280]">Direct booking</p>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#222222]">
          Dates
        </p>
        <p className="mt-1 text-xs text-[#717171]">
          Pricing for your stay appears above and in the
          summary after you select dates.
        </p>
        {availabilityLoading ? (
          <p className="mt-2 text-xs text-[#717171]">Loading availability…</p>
        ) : null}
        <div className="mt-3 flex justify-center rounded-2xl border border-[#e5e5e5] bg-white p-2">
          <Calendar
            mode="range"
            min={1}
            resetOnSelect
            month={month}
            onMonthChange={setMonth}
            selected={rangeSelected}
            onSelect={onRangeSelect}
            disabled={disabledMatcher}
            modifiers={calendarModifiers}
            modifiersClassNames={{
              disabled: "opacity-40",
              strikeDisabled: "line-through",
            }}
            className="border-0 shadow-none"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#b0b0b0]">
        <div className="grid grid-cols-2 divide-x divide-[#b0b0b0]">
          <label className="p-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#222222]">
              Check-in
            </span>
            <input
              type="date"
              value={checkIn}
              min={todayIso}
              max={addCalendarDay(rangeBounds.to, -1)}
              onChange={(event) => {
                const v = event.target.value;
                setCheckIn(v);
                if (checkOut && checkOut <= v) setCheckOut("");
              }}
              className="mt-1 w-full bg-transparent text-sm text-[#222222] outline-none [color-scheme:light]"
            />
          </label>
          <label className="p-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#222222]">
              Checkout
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn ? minCheckoutIso : todayIso}
              max={rangeBounds.to}
              onChange={(event) => setCheckOut(event.target.value)}
              className="mt-1 w-full bg-transparent text-sm text-[#222222] outline-none [color-scheme:light]"
            />
          </label>
        </div>

        <div className="border-t border-[#b0b0b0] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#222222]">
            Guests
          </p>
          <div className="mt-3 space-y-3">
            {[
              {
                label: "Adults",
                value: adults,
                minimum: 1,
                decrease: () => updateGuestCount(setAdults, -1, 1),
                increase: () => updateGuestCount(setAdults, 1, 1),
              },
              {
                label: "Children",
                value: children,
                minimum: 0,
                decrease: () => updateGuestCount(setChildren, -1, 0),
                increase: () => updateGuestCount(setChildren, 1, 0),
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#222222]">{row.label}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={row.decrease}
                    disabled={row.value <= row.minimum}
                    className="grid h-8 w-8 place-items-center rounded-full border border-[#b0b0b0] text-lg leading-none text-[#5c6360] transition hover:border-[#222222] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    -
                  </button>
                  <span className="w-5 text-center text-sm font-semibold text-[#222222]">
                    {row.value}
                  </span>
                  <button
                    type="button"
                    onClick={row.increase}
                    disabled={maxGuests != null && guests >= maxGuests}
                    className="grid h-8 w-8 place-items-center rounded-full border border-[#b0b0b0] text-lg leading-none text-[#5c6360] transition hover:border-[#222222] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          {maxGuests != null ? (
            <p className="mt-3 text-xs text-[#717171]">Maximum {maxGuests} guests</p>
          ) : null}
        </div>
      </div>

      {stayCheck && !stayCheck.ok ? (
        <p className="mt-3 text-center text-xs text-red-600">{stayCheck.reason}</p>
      ) : null}

      {canReserve ? (
        <div className="mt-4">
          <CancellationRateSelector
            options={rateOptions}
            selectedKey={selectedPolicyKey}
            onSelect={(key) =>
              setSelectedPolicyKey(key as CancellationPolicyKey)
            }
            currency={quoteCurrency}
            nights={nights}
            loading={quoteLoading}
          />
        </div>
      ) : null}

      <Link
        href={bookHref}
        aria-disabled={!canReserve}
        className={`mt-5 block w-full rounded-xl py-3.5 text-center text-sm font-bold text-white transition ${
          canReserve
            ? "bg-[#2d6a4f] hover:bg-[#245a43]"
            : "pointer-events-none bg-[#2d6a4f]/45"
        }`}
      >
        Book
      </Link>
      <p className="mt-3 text-center text-xs text-[#717171]">
        {canReserve
          ? "You won't be charged yet"
          : "Select valid check-in and check-out dates to continue"}
      </p>

      <div className="mt-6 space-y-3 text-sm text-[#222222]">
        {selectedTotalCents != null && nights > 0 ? (
          <div className="flex justify-between border-t border-[#dddddd] pt-4 font-semibold">
            <span>Total</span>
            <span>{formatMoney(selectedTotalCents, quoteCurrency)}</span>
          </div>
        ) : stayPricing && nights > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="underline underline-offset-2">
                {formatMoney(stayPricing.avgNightCents, pricingCurrency)} × {nights}{" "}
                night{nights === 1 ? "" : "s"}
              </span>
              <span>{formatMoney(stayPricing.subtotalCents, pricingCurrency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="underline underline-offset-2">Service fee</span>
              <span>{formatMoney(stayPricing.serviceFeeCents, pricingCurrency)}</span>
            </div>
            <div className="flex justify-between border-t border-[#dddddd] pt-4 font-semibold">
              <span>Total before taxes</span>
              <span>{formatMoney(stayPricing.totalCents, pricingCurrency)}</span>
            </div>
          </>
        ) : nightlyRate != null && nights > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="underline underline-offset-2">
                {formatCurrencyDollars(nightlyRate)} × {nights} night{nights === 1 ? "" : "s"}
              </span>
              <span>{formatCurrencyDollars(nightlyRate * nights)}</span>
            </div>
            <div className="flex justify-between">
              <span className="underline underline-offset-2">Service fee</span>
              <span>{formatCurrencyDollars(Math.round(nightlyRate * nights * 0.08))}</span>
            </div>
            <div className="flex justify-between border-t border-[#dddddd] pt-4 font-semibold">
              <span>Total before taxes</span>
              <span>
                {formatCurrencyDollars(
                  Math.round(nightlyRate * nights * 1.08),
                )}
              </span>
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-[#717171]">
            Select dates to see the updated total.
          </p>
        )}
      </div>
    </aside>
  );
}
