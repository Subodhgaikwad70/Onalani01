"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiPatch, apiPost } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { getListingPrimaryPhoto } from "@/lib/listings";
import { cn } from "@/lib/utils";

type CalendarListingRail = {
  id: string;
  slug: string;
  unit_type: string | null;
  photos_url: string[] | null;
  property_name: string | null;
};

type GridDay = {
  date: string;
  price_cents: number;
  currency: string;
  min_stay: number | null;
  max_stay?: number | null;
  override_status?: string;
  available: boolean;
  calendar_block: boolean;
  calendar_override_price: boolean;
  calendar_override_min_stay: boolean;
  booking_ids: string[];
};

type GridBooking = {
  id: string;
  code: string;
  check_in: string;
  check_out: string;
  guest_display_name: string;
  adults: number;
  children: number;
};

type GridResponse = {
  listing: {
    id: string;
    slug: string;
    unit_type: string | null;
    photos_url: string[] | null;
    base_price_cents: number | null;
    currency: string | null;
    min_nights: number | null;
    max_nights: number | null;
    beds24_room_id: string | null;
  };
  days: GridDay[];
  bookings: GridBooking[];
  pricing_rules: Array<{ kind: string; config: Record<string, unknown> }>;
};

function inclusiveIsoRange(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((d) => format(d, "yyyy-MM-dd"));
}

export function AdminCalendarClient() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pickedListingId, setPickedListingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragAnchorRef = useRef<string | null>(null);

  const [selPrice, setSelPrice] = useState("");
  const [selMinStay, setSelMinStay] = useState("");
  const [selCheckIn, setSelCheckIn] = useState(true);
  const [selCheckOut, setSelCheckOut] = useState(true);

  const [basePrice, setBasePrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [minNights, setMinNights] = useState("1");
  const [maxNights, setMaxNights] = useState("");
  const [savingListing, setSavingListing] = useState(false);

  const gridBounds = useMemo(() => {
    const ms = startOfMonth(month);
    const me = endOfMonth(month);
    const gs = startOfWeek(ms, { weekStartsOn: 0 });
    const ge = endOfWeek(me, { weekStartsOn: 0 });
    const from = format(gs, "yyyy-MM-dd");
    const endPlus = new Date(ge);
    endPlus.setDate(endPlus.getDate() + 1);
    return {
      from,
      toExclusive: format(endPlus, "yyyy-MM-dd"),
      gridStart: gs,
      gridEnd: ge,
    };
  }, [month]);

  const listingsQuery = useQuery({
    queryKey: ["host-calendar-listings-index"],
    queryFn: async () => {
      const res = await fetch("/api/admin/calendar/listings", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("listings");
      return res.json() as Promise<{ listings: CalendarListingRail[] }>;
    },
  });

  const railListings = listingsQuery.data?.listings ?? [];
  const listingId = pickedListingId ?? railListings[0]?.id ?? null;

  const gridQuery = useQuery({
    queryKey: ["host-calendar-grid", listingId, gridBounds.from, gridBounds.toExclusive],
    enabled: Boolean(listingId),
    queryFn: async () => {
      const u = new URL(`/api/admin/listings/${listingId}/calendar/grid`, window.location.origin);
      u.searchParams.set("from", gridBounds.from);
      u.searchParams.set("to", gridBounds.toExclusive);
      const res = await fetch(u.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("grid");
      return res.json() as Promise<GridResponse>;
    },
  });

  /* Align sidebar defaults when server listing fields change (switch listing / refetch). */
  /* eslint-disable react-hooks/exhaustive-deps -- scalar deps intentionally omit gridQuery.data.listing object */
  useEffect(() => {
    const L = gridQuery.data?.listing;
    if (!L || L.id !== listingId) return;
    /* eslint-disable react-hooks/set-state-in-effect -- controlled defaults mirror GET listing */
    setBasePrice(String(L.base_price_cents ?? 0));
    setCurrency((L.currency ?? "USD").slice(0, 3).toUpperCase());
    setMinNights(String(L.min_nights ?? 1));
    setMaxNights(L.max_nights != null ? String(L.max_nights) : "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    listingId,
    gridQuery.data?.listing?.base_price_cents,
    gridQuery.data?.listing?.currency,
    gridQuery.data?.listing?.min_nights,
    gridQuery.data?.listing?.max_nights,
    gridQuery.data?.listing?.id,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const dayMap = useMemo(() => {
    const m = new Map<string, GridDay>();
    for (const d of gridQuery.data?.days ?? []) {
      m.set(d.date, d);
    }
    return m;
  }, [gridQuery.data?.days]);

  const bookingById = useMemo(() => {
    const m = new Map<string, GridBooking>();
    for (const b of gridQuery.data?.bookings ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [gridQuery.data?.bookings]);

  const calendarCells = useMemo(
    () =>
      eachDayOfInterval({
        start: gridBounds.gridStart,
        end: gridBounds.gridEnd,
      }),
    [gridBounds.gridStart, gridBounds.gridEnd],
  );

  const clearSelection = useCallback(() => {
    setSelection([]);
    dragAnchorRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  async function applySelectionPatch(patch: Record<string, unknown>, clearOverride?: boolean) {
    if (!listingId || selection.length === 0) {
      toast.error("Select one or more dates on the calendar.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/calendar/day-overrides`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection,
          patch: clearOverride ? {} : patch,
          clear: Boolean(clearOverride),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: { message?: string } }).error?.message ?? "Update failed",
        );
      }
      toast.success(clearOverride ? "Cleared overrides" : "Dates updated");
      clearSelection();
      await qc.invalidateQueries({
        queryKey: ["host-calendar-grid", listingId],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function blockSelection() {
    if (!listingId || selection.length === 0) {
      toast.error("Select dates to block.");
      return;
    }
    const sorted = [...selection].sort();
    const starts_on = sorted[0];
    const ends_on = sorted[sorted.length - 1];
    try {
      await apiPost(`/api/admin/listings/${listingId}/calendar/blocks`, {
        starts_on,
        ends_on,
        reason: "Blocked from calendar",
      });
      toast.success("Dates blocked");
      clearSelection();
      await qc.invalidateQueries({
        queryKey: ["host-calendar-grid", listingId],
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not block");
    }
  }

  async function saveListingDefaults() {
    if (!listingId) return;
    const min = Number.parseInt(minNights, 10);
    if (!Number.isFinite(min) || min < 1) {
      toast.error("Minimum nights must be at least 1.");
      return;
    }
    const maxRaw = maxNights.trim();
    const maxParsed = maxRaw ? Number.parseInt(maxRaw, 10) : NaN;
    if (maxRaw && (!Number.isFinite(maxParsed) || maxParsed < min)) {
      toast.error("Maximum nights must be empty or ≥ minimum nights.");
      return;
    }
    setSavingListing(true);
    try {
      await apiPatch(`/api/admin/listings/${listingId}`, {
        base_price_cents: Number(basePrice) || 0,
        currency: (currency || "USD").slice(0, 3).toUpperCase(),
        min_nights: min,
        max_nights: Number.isFinite(maxParsed) ? maxParsed : null,
      });
      toast.success("Listing defaults saved");
      await qc.invalidateQueries({
        queryKey: ["host-calendar-grid", listingId],
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSavingListing(false);
    }
  }

  const listings = railListings;
  const gridLoading = gridQuery.isFetching;
  const L = gridQuery.data?.listing;
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const losRule = gridQuery.data?.pricing_rules?.find((r) => r.kind === "length_of_stay");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:w-[min(17rem,100%)]">
        <p className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-[#717171] lg:block">
          Properties & listings
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:gap-2 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {listingsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading listings…</p>
        ) : listings.length === 0 ? (
          <p className="max-w-xs text-sm text-muted-foreground">
            No listings yet. Create one under Listings.
          </p>
        ) : (
          listings.map((l) => {
            const thumb = getListingPrimaryPhoto({
              photos_url: l.photos_url ?? [],
            });
            const active = l.id === listingId;
            const propertyLabel =
              l.property_name?.trim() || "Untitled property";
            const listingLabel = l.unit_type?.trim() || l.slug;
            return (
              <button
                key={l.id}
                type="button"
                title={`${propertyLabel} — ${listingLabel}`}
                aria-label={`${propertyLabel}, ${listingLabel}`}
                onClick={() => {
                  setPickedListingId(l.id);
                  clearSelection();
                }}
                className={cn(
                  "flex min-w-[220px] shrink-0 items-center gap-3 rounded-xl border-2 bg-white px-2 py-2 text-left transition-colors lg:min-w-0 lg:w-full",
                  active
                    ? "border-[#5cbadf] ring-2 ring-[#5cbadf]/25"
                    : "border-transparent hover:border-[#ebebeb]",
                )}
              >
                <div
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#e8e8e8]",
                  )}
                >
                  {thumb ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- external listing URLs */}
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    </>
                  ) : (
                    <div className="h-full w-full bg-[#e8e8e8]" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs leading-snug text-[#717171]">
                    {propertyLabel}
                  </p>
                  <p className="truncate text-sm font-semibold leading-snug text-[#222222]">
                    {listingLabel}
                  </p>
                </div>
              </button>
            );
          })
        )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <Card className="overflow-hidden p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-[10rem] font-(family-name:--font-lora) text-xl font-semibold capitalize">
                {format(month, "MMMM yyyy")}
              </h2>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMonth(startOfMonth(new Date()))}
              >
                Today
              </Button>
              {L ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`/admin/listings/${L.id}`}>Listing settings</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px rounded-lg border border-[#ebebeb] bg-[#ebebeb] text-center text-xs font-medium text-[#717171]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
              <div key={w} className="bg-[#fafafa] py-2">
                {w}
              </div>
            ))}
            {calendarCells.map((cellDate) => {
              const iso = format(cellDate, "yyyy-MM-dd");
              const inMonth = cellDate.getMonth() === month.getMonth();
              const day = dayMap.get(iso);
              const isPast = inMonth && iso < todayIso;
              const selected = selection.includes(iso);
              const booked = (day?.booking_ids?.length ?? 0) > 0;
              const blocked = day?.calendar_block ?? false;
              const avail = day?.available ?? true;

              let tone =
                "bg-white hover:bg-[#f7fbfd]";
              if (!inMonth) tone = "bg-[#fafafa] text-[#c6c6c6]";
              else if (isPast) tone = "bg-[#f5f5f5] text-[#9a9a9a]";
              else if (booked) tone = "bg-[#222222] text-white hover:bg-[#333]";
              else if (blocked || !avail) tone = "bg-[#e8e8e8] text-[#717171]";
              if (selected) tone = cn(tone, "ring-2 ring-[#5cbadf] ring-inset");

              const primaryBooking =
                day?.booking_ids?.length && day.booking_ids[0]
                  ? bookingById.get(day.booking_ids[0])
                  : undefined;

              return (
                <div
                  key={iso}
                  role="button"
                  tabIndex={inMonth ? 0 : -1}
                  className={cn(
                    "relative min-h-[76px] cursor-pointer select-none p-1 text-left transition-colors md:min-h-[88px]",
                    tone,
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!inMonth) return;
                    dragAnchorRef.current = iso;
                    setSelection([iso]);
                    setDragging(true);
                  }}
                  onMouseEnter={() => {
                    if (!dragging || !dragAnchorRef.current || !inMonth) return;
                    setSelection(inclusiveIsoRange(dragAnchorRef.current, iso));
                  }}
                  onKeyDown={(e) => {
                    if (!inMonth) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelection([iso]);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        booked ? "text-white" : "text-[#222222]",
                      )}
                    >
                      {format(cellDate, "d")}
                    </span>
                  </div>
                  {inMonth && day ? (
                    <div
                      className={cn(
                        "mt-1 truncate text-[11px] tabular-nums",
                        booked ? "text-white/90" : "text-[#717171]",
                      )}
                    >
                      {formatMoney(day.price_cents, day.currency)}
                    </div>
                  ) : null}
                  {inMonth && primaryBooking ? (
                    <div className="mt-1 truncate rounded bg-white/15 px-1 py-0.5 text-[10px] font-medium leading-tight text-white">
                      {primaryBooking.guest_display_name}
                      {primaryBooking.adults + primaryBooking.children > 1
                        ? ` +${primaryBooking.adults + primaryBooking.children - 1}`
                        : ""}
                    </div>
                  ) : null}
                  {inMonth && day?.calendar_override_price ? (
                    <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#5cbadf]" />
                  ) : null}
                </div>
              );
            })}
          </div>

          {gridLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Refreshing calendar…</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#717171]">
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 rounded bg-white ring-1 ring-[#ebebeb]" /> Available
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 rounded bg-[#222222]" /> Reservation
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 rounded bg-[#e8e8e8]" /> Blocked / unavailable
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-6 rounded bg-[#f5f5f5]" /> Past
            </span>
          </div>
        </Card>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-[340px]">
        <Card className="p-5">
          <h3 className="font-semibold text-[#222222]">Price settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Defaults apply when Beds24 has no nightly row for that date.
          </p>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="base-price">Base price (¢ / night)</Label>
              <Input
                id="base-price"
                type="number"
                min={0}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="listing-currency">Currency</Label>
              <Input
                id="listing-currency"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={savingListing || !listingId}
              onClick={() => void saveListingDefaults()}
            >
              {savingListing ? "Saving…" : "Save defaults"}
            </Button>
          </div>
          {typeof losRule?.config?.discount_pct === "number" &&
          typeof losRule?.config?.min_nights === "number" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Length-of-stay: {String(losRule.config.discount_pct)}% off stays ≥{" "}
              {String(losRule.config.min_nights)} nights.
            </p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-[#222222]">Availability settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Global stay rules for this listing.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="min-nights">Min nights</Label>
              <Input
                id="min-nights"
                inputMode="numeric"
                value={minNights}
                onChange={(e) => setMinNights(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-nights">Max nights</Label>
              <Input
                id="max-nights"
                inputMode="numeric"
                placeholder="No limit"
                value={maxNights}
                onChange={(e) => setMaxNights(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            className="mt-4"
            size="sm"
            disabled={savingListing || !listingId}
            onClick={() => void saveListingDefaults()}
          >
            {savingListing ? "Saving…" : "Save rules"}
          </Button>
          {L?.beds24_room_id ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Detailed nightly availability syncs from Beds24 (cached ~5 minutes).
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No Beds24 room linked — availability follows listing defaults and manual blocks.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-[#222222]">Selected dates</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag across the grid or click a day, then extend with drag. Esc clears.
          </p>
          <p className="mt-2 text-sm font-medium text-[#222222]">
            {selection.length === 0
              ? "None"
              : `${selection.length} night${selection.length === 1 ? "" : "s"}`}
          </p>

          <div className="mt-4 space-y-3 border-t border-[#ebebeb] pt-4">
            <div className="space-y-2">
              <Label htmlFor="sel-price">Override price (¢ / night)</Label>
              <Input
                id="sel-price"
                inputMode="numeric"
                placeholder="Leave blank to skip"
                value={selPrice}
                onChange={(e) => setSelPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sel-min">Override min stay (nights)</Label>
              <Input
                id="sel-min"
                inputMode="numeric"
                placeholder="Leave blank to skip"
                value={selMinStay}
                onChange={(e) => setSelMinStay(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ebebeb] px-3 py-2">
              <Label htmlFor="sel-ci">Check-in allowed</Label>
              <Switch
                id="sel-ci"
                checked={selCheckIn}
                onCheckedChange={setSelCheckIn}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ebebeb] px-3 py-2">
              <Label htmlFor="sel-co">Check-out allowed</Label>
              <Switch
                id="sel-co"
                checked={selCheckOut}
                onCheckedChange={setSelCheckOut}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Turning check-in or check-out off marks those nights unavailable to guests (simple
              rule).
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!listingId || selection.length === 0}
                onClick={() => {
                  const patch: Record<string, unknown> = {
                    check_in_allowed: selCheckIn,
                    check_out_allowed: selCheckOut,
                  };
                  if (selPrice.trim()) {
                    const n = Number.parseInt(selPrice, 10);
                    if (!Number.isFinite(n) || n < 0) {
                      toast.error("Price override must be a non-negative integer (cents).");
                      return;
                    }
                    patch.price_cents = n;
                  }
                  if (selMinStay.trim()) {
                    const n = Number.parseInt(selMinStay, 10);
                    if (!Number.isFinite(n) || n < 1) {
                      toast.error("Min stay override must be at least 1.");
                      return;
                    }
                    patch.min_stay = n;
                  }
                  void applySelectionPatch(patch);
                }}
              >
                Apply to selection
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!listingId || selection.length === 0}
                onClick={() => void applySelectionPatch({}, true)}
              >
                Clear overrides
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!listingId || selection.length === 0}
                onClick={() => void blockSelection()}
              >
                Block selected (maintenance / owner stay)
              </Button>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}
