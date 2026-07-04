"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { addCalendarDay } from "@/lib/calendar/dates";
import {
  allNightsAvailableInRange,
  earliestValidCheckOutExclusive,
  isCheckInSelectable,
  requiredMinNightsForCheckIn,
  type PublicAvailabilityPayload,
  validateStayAgainstSlice,
} from "@/lib/booking/stay-validation";

type AvailabilityApiResponse = PublicAvailabilityPayload & {
  currency?: string;
};

export function StayDateRangePicker({
  listingSlug,
  excludeBookingId,
  listingMinNights,
  listingMaxNights,
  checkIn,
  checkOut,
  onDatesChange,
}: {
  listingSlug: string;
  excludeBookingId?: string;
  listingMinNights?: number | null;
  listingMaxNights?: number | null;
  checkIn: string;
  checkOut: string;
  onDatesChange: (checkIn: string, checkOut: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    if (checkIn) return startOfDay(parseISO(`${checkIn}T12:00:00`));
    return startOfDay(new Date());
  });

  const rangeBounds = useMemo(() => {
    const start = startOfDay(new Date());
    const from = format(start, "yyyy-MM-dd");
    const to = format(addDays(start, 549), "yyyy-MM-dd");
    return { from, to };
  }, []);

  const todayIso = useMemo(
    () => format(startOfDay(new Date()), "yyyy-MM-dd"),
    [],
  );

  const { data: availability, isLoading } = useQuery({
    queryKey: [
      "listing-availability",
      listingSlug,
      rangeBounds.from,
      rangeBounds.to,
      excludeBookingId ?? "",
    ],
    queryFn: async (): Promise<AvailabilityApiResponse> => {
      const u = new URL("/api/availability", window.location.origin);
      u.searchParams.set("listing_slug", listingSlug);
      u.searchParams.set("from", rangeBounds.from);
      u.searchParams.set("to", rangeBounds.to);
      if (excludeBookingId) {
        u.searchParams.set("exclude_booking_id", excludeBookingId);
      }
      const r = await fetch(u.toString());
      if (!r.ok) throw new Error("availability");
      return r.json() as Promise<AvailabilityApiResponse>;
    },
    staleTime: 60_000,
  });

  const stayCheck = useMemo(() => {
    if (!availability || !checkIn || !checkOut) return null;
    return validateStayAgainstSlice(availability, checkIn, checkOut, {
      listingMinNights,
      listingMaxNights,
    });
  }, [availability, checkIn, checkOut, listingMinNights, listingMaxNights]);

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

  const onRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      if (!range?.from) {
        onDatesChange("", "");
        return;
      }
      const ci = format(range.from, "yyyy-MM-dd");
      if (!range.to) {
        onDatesChange(ci, "");
        return;
      }
      const co = format(range.to, "yyyy-MM-dd");
      if (co <= ci) {
        onDatesChange(ci, "");
        return;
      }
      onDatesChange(ci, co);
    },
    [onDatesChange],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#717171]">
        Select check-in, then check-out. Unavailable dates are greyed out or
        struck through.
      </p>
      {isLoading ? (
        <p className="text-xs text-[#717171]">Loading availability…</p>
      ) : null}
      <div className="flex justify-center rounded-2xl border border-[#e5e5e5] bg-white p-2">
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
      <div className="overflow-hidden rounded-xl border border-[#dfe6e1]">
        <div className="grid grid-cols-2 divide-x divide-[#dfe6e1]">
          <label className="p-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b7280]">
              Check-in
            </span>
            <input
              type="date"
              value={checkIn}
              min={todayIso}
              max={addCalendarDay(rangeBounds.to, -1)}
              onChange={(event) => {
                const v = event.target.value;
                onDatesChange(v, checkOut && checkOut <= v ? "" : checkOut);
              }}
              className="mt-1 w-full bg-transparent text-sm text-[#1f2937] outline-none [color-scheme:light]"
            />
          </label>
          <label className="p-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b7280]">
              Check-out
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn ? minCheckoutIso : todayIso}
              max={rangeBounds.to}
              onChange={(event) => onDatesChange(checkIn, event.target.value)}
              className="mt-1 w-full bg-transparent text-sm text-[#1f2937] outline-none [color-scheme:light]"
            />
          </label>
        </div>
      </div>
      {stayCheck && !stayCheck.ok ? (
        <p className="text-xs text-red-600" role="alert">
          {stayCheck.reason}
        </p>
      ) : checkIn && checkOut && stayCheck?.ok ? (
        <p className="text-xs text-[#2d6a4f]">
          {checkIn} → {checkOut} · valid stay
        </p>
      ) : checkIn && !checkOut ? (
        <p className="text-xs text-[#717171]">Now select your check-out date.</p>
      ) : null}
    </div>
  );
}
