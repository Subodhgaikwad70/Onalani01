"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Field = readonly [string, string];

function readInitialLocation(
  fields: Field[],
  initialLocation?: string,
): string {
  if (initialLocation !== undefined) return initialLocation;
  const fromField = fields.find(([label]) => label === "Location")?.[1] ?? "";
  if (
    fromField === "Where are you going?" ||
    fromField === "This destination"
  ) {
    return "";
  }
  return fromField;
}

/** Stable document listener — avoids re-subscribing on every open/close tick. */
function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isActive) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      onDismissRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismissRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, ref]);
}

const fieldShell =
  "relative flex min-w-0 flex-1 flex-col justify-center px-4 py-3 transition hover:bg-white sm:px-5 sm:py-3";

export function HeroSearchCard({
  title,
  subtitle,
  fields,
  locationOptions = [],
  initialLocation: initialLocationProp,
  initialCheckIn = "",
  initialCheckOut = "",
  initialAdults = 0,
  initialChildren = 0,
}: {
  title: string;
  subtitle: string;
  fields?: Field[];
  locationOptions?: string[];
  initialLocation?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialAdults?: number;
  initialChildren?: number;
}) {
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const guestsRef = useRef<HTMLDivElement>(null);

  const row: Field[] = fields ?? [
    ["Location", "Where are you going?"],
    ["Check-in", "Add date"],
    ["Check-out", "Add date"],
    ["Guests", "Number of guests"],
  ];
  const locationPlaceholder =
    row.find(([label]) => label === "Location")?.[1] ?? "Where are you going?";

  const resolvedInitialLocation = readInitialLocation(row, initialLocationProp);

  const [location, setLocation] = useState(resolvedInitialLocation);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [adults, setAdults] = useState(initialAdults);
  const [children, setChildren] = useState(initialChildren);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isGuestsOpen, setIsGuestsOpen] = useState(false);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return locationOptions
      .map((option) => option.trim())
      .filter(Boolean)
      .filter((option) => {
        const key = option.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [locationOptions]);

  const hasActiveLocation = location.trim().length > 0;

  const visibleSuggestions = useMemo(() => {
    const query = location.trim().toLowerCase();
    if (!query) return suggestions;

    const filtered = suggestions.filter((option) =>
      option.toLowerCase().includes(query),
    );

    if (
      filtered.length === 1 &&
      filtered[0].toLowerCase() === query &&
      isLocationOpen
    ) {
      return suggestions;
    }

    return filtered.length > 0 ? filtered : suggestions;
  }, [isLocationOpen, location, suggestions]);

  const showSuggestions = isLocationOpen && visibleSuggestions.length > 0;

  const totalGuests = adults + children;
  const guestLabel =
    totalGuests > 0
      ? `${totalGuests} guest${totalGuests === 1 ? "" : "s"}`
      : (row.find(([label]) => label === "Guests")?.[1] ?? "Number of guests");

  const guestRows = [
    {
      label: "Adults",
      value: adults,
      decrease: () => setAdults((current) => Math.max(0, current - 1)),
      increase: () => setAdults((current) => current + 1),
    },
    {
      label: "Children",
      value: children,
      decrease: () => setChildren((current) => Math.max(0, current - 1)),
      increase: () => setChildren((current) => current + 1),
    },
  ];

  const searchHref = useMemo(() => {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (checkIn) params.set("checkin", checkIn);
    if (checkOut) params.set("checkout", checkOut);
    if (adults > 0) params.set("adults", String(adults));
    if (children > 0) params.set("children", String(children));
    const query = params.toString();
    return query ? `/properties?${query}` : "/properties";
  }, [adults, checkIn, checkOut, children, location]);

  const closeLocation = useCallback(() => setIsLocationOpen(false), []);
  const closeGuests = useCallback(() => setIsGuestsOpen(false), []);

  useDismissOnOutsideClick(locationRef, isLocationOpen, closeLocation);
  useDismissOnOutsideClick(guestsRef, isGuestsOpen, closeGuests);

  function clearLocation() {
    setLocation("");
    setIsLocationOpen(true);
    requestAnimationFrame(() => locationInputRef.current?.focus());
  }

  function selectSuggestion(value: string) {
    setLocation(value);
    setIsLocationOpen(false);
  }

  function openLocation() {
    setIsGuestsOpen(false);
    setIsLocationOpen(true);
  }

  function toggleGuests() {
    setIsLocationOpen(false);
    setIsGuestsOpen((current) => !current);
  }

  return (
    <div className="w-full min-w-0 rounded-[1.35rem] border border-[#ebebeb] bg-white p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] sm:p-6 md:p-9">
      <h2 className="text-xl font-semibold tracking-tight text-[#2d3330] sm:text-2xl md:text-[1.65rem]">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6b7280] md:text-base">
        {subtitle}
      </p>

      <div className="mt-6 flex w-full min-w-0 flex-col gap-3 sm:mt-8 sm:gap-4 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col rounded-[1.35rem] border border-[#e5e5e5] bg-[#fafafa] sm:rounded-[1.65rem] md:min-h-[3.25rem] md:flex-row md:divide-x md:divide-[#e8e8e8]">
          {/* Location */}
          <div
            ref={locationRef}
            className={cn(fieldShell, "md:rounded-l-[1.65rem]")}
          >
            <label
              htmlFor="hero-search-location"
              className="text-xs font-semibold text-[#2d3330]"
            >
              Location
            </label>
            <div className="relative mt-0.5 min-w-0">
              <input
                ref={locationInputRef}
                id="hero-search-location"
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                onFocus={openLocation}
                placeholder={locationPlaceholder}
                className={cn(
                  "min-w-0 w-full truncate bg-transparent text-sm text-[#2d3330] outline-none placeholder:text-[#9ca3af]",
                  hasActiveLocation && "pr-8",
                )}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                aria-controls="hero-search-location-listbox"
              />
              {hasActiveLocation ? (
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={clearLocation}
                  className="absolute right-0 top-1/2 flex h-7 w-7 shrink-0 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#5c6360]"
                  aria-label="Clear location"
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </div>
            {showSuggestions ? (
              <ul
                id="hero-search-location-listbox"
                role="listbox"
                className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 max-h-52 overflow-y-auto rounded-2xl border border-[#e5e5e5] bg-white py-1 shadow-xl sm:inset-x-2"
              >
                {visibleSuggestions.map((suggestion) => {
                  const selected =
                    suggestion.toLowerCase() === location.trim().toLowerCase();
                  return (
                    <li key={suggestion} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => selectSuggestion(suggestion)}
                        className={cn(
                          "block w-full truncate px-4 py-2.5 text-left text-sm transition",
                          selected
                            ? "bg-[#faf3ed] font-medium text-[#2d3330]"
                            : "text-[#5c6360] hover:bg-[#faf3ed] hover:text-[#2d3330]",
                        )}
                      >
                        {suggestion}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* Check-in */}
          <label
            className={cn(
              fieldShell,
              "cursor-pointer border-t border-[#e8e8e8] md:border-t-0",
            )}
          >
            <span className="text-xs font-semibold text-[#2d3330]">
              Check-in
            </span>
            <input
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
              onFocus={() => {
                setIsGuestsOpen(false);
                setIsLocationOpen(false);
              }}
              className="mt-0.5 min-w-0 w-full max-w-full bg-transparent text-sm text-[#5c6360] outline-none [color-scheme:light]"
            />
          </label>

          {/* Check-out */}
          <label
            className={cn(
              fieldShell,
              "cursor-pointer border-t border-[#e8e8e8] md:border-t-0",
            )}
          >
            <span className="text-xs font-semibold text-[#2d3330]">
              Check-out
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(event) => setCheckOut(event.target.value)}
              onFocus={() => {
                setIsGuestsOpen(false);
                setIsLocationOpen(false);
              }}
              className="mt-0.5 min-w-0 w-full max-w-full bg-transparent text-sm text-[#5c6360] outline-none [color-scheme:light]"
            />
          </label>

          {/* Guests */}
          <div
            ref={guestsRef}
            className={cn(
              fieldShell,
              "border-t border-[#e8e8e8] md:rounded-r-[1.65rem] md:border-t-0",
            )}
          >
            <button
              type="button"
              aria-expanded={isGuestsOpen}
              aria-haspopup="dialog"
              onClick={toggleGuests}
              className="w-full min-w-0 touch-manipulation text-left"
            >
              <span className="block text-xs font-semibold text-[#2d3330]">
                Guests
              </span>
              <span className="mt-0.5 block truncate text-sm text-[#9ca3af]">
                {guestLabel}
              </span>
            </button>
            {isGuestsOpen ? (
              <div
                role="dialog"
                aria-label="Guest count"
                className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-xl sm:inset-x-auto sm:right-0 sm:w-full sm:max-w-xs"
              >
                {guestRows.map(({ label, value, decrease, increase }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 py-2 sm:gap-4"
                  >
                    <span className="shrink-0 text-sm font-medium text-[#2d3330]">
                      {label}
                    </span>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={decrease}
                        className="grid h-9 w-9 touch-manipulation place-items-center rounded-full border border-[#d1d5db] text-lg leading-none text-[#5c6360] transition hover:border-[#d99e64] sm:h-8 sm:w-8"
                        aria-label={`Decrease ${label}`}
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums text-[#2d3330]">
                        {value}
                      </span>
                      <button
                        type="button"
                        onClick={increase}
                        className="grid h-9 w-9 touch-manipulation place-items-center rounded-full border border-[#d1d5db] text-lg leading-none text-[#5c6360] transition hover:border-[#d99e64] sm:h-8 sm:w-8"
                        aria-label={`Increase ${label}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <Link
          href={searchHref}
          onClick={() => {
            setIsGuestsOpen(false);
            setIsLocationOpen(false);
          }}
          className="inline-flex w-full shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#d99e64] px-6 py-3.5 text-center text-xs font-bold uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-[#c88a52] sm:px-8 sm:py-4 lg:h-[3.25rem] lg:w-auto lg:self-center lg:py-0"
        >
          Search stays
        </Link>
      </div>
    </div>
  );
}
