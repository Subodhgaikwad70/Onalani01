import { addCalendarDay } from "@/lib/calendar/dates";

/** Shape returned by GET /api/availability (per-day maps). */
export type PublicAvailabilityPayload = {
  available: Record<string, boolean>;
  min_stay: Record<string, number | null>;
  max_stay: Record<string, number | null>;
  override_status: Record<string, string>;
  prices_cents?: Record<string, number>;
};

export function eachOccupiedNightIso(
  checkIn: string,
  checkOutExclusive: string,
): string[] {
  const out: string[] = [];
  let d = checkIn;
  while (d < checkOutExclusive) {
    out.push(d);
    d = addCalendarDay(d, 1);
  }
  return out;
}

/** Minimum nights required for a stay starting on `checkIn` (listing vs cache). */
export function requiredMinNightsForCheckIn(
  p: PublicAvailabilityPayload,
  checkIn: string,
  opts?: { listingMinNights?: number | null; listingMaxNights?: number | null },
): number {
  const listingMin =
    opts?.listingMinNights != null && opts.listingMinNights >= 1
      ? opts.listingMinNights
      : 1;
  const cacheMin =
    typeof p.min_stay[checkIn] === "number" && p.min_stay[checkIn] >= 1
      ? p.min_stay[checkIn]
      : 1;
  return Math.max(listingMin, cacheMin);
}

/** First valid exclusive checkout date (morning of departure) for `requiredMin` nights. */
export function earliestValidCheckOutExclusive(
  checkIn: string,
  requiredMinNights: number,
): string {
  return addCalendarDay(checkIn, requiredMinNights);
}

function overrideOf(p: PublicAvailabilityPayload, iso: string): string {
  return p.override_status[iso] ?? "none";
}

/** Nights that cannot be occupied (inventory + hard block on that night). */
export function isNightUnavailableForStay(
  p: PublicAvailabilityPayload,
  iso: string,
): boolean {
  if (p.available[iso] === false) return true;
  const ov = overrideOf(p, iso);
  return ov === "nocheckinorcheckout";
}

/** First night of stay: may check in on this calendar date. */
export function isCheckInSelectable(
  p: PublicAvailabilityPayload,
  iso: string,
): boolean {
  if (isNightUnavailableForStay(p, iso)) return false;
  const ov = overrideOf(p, iso);
  if (ov === "nocheckin" || ov === "nocheckinorcheckout") return false;
  return true;
}

/**
 * Departure morning on `iso` (exclusive end of stay): previous calendar day
 * must be a stayable night; `iso` itself may be "unavailable" as a night.
 */
export function isCheckOutSelectable(
  p: PublicAvailabilityPayload,
  iso: string,
): boolean {
  const prev = addCalendarDay(iso, -1);
  if (isNightUnavailableForStay(p, prev)) return false;
  const ov = overrideOf(p, iso);
  if (ov === "nocheckout" || ov === "nocheckinorcheckout") return false;
  return true;
}

/** Cell is clickable as either check-in night or check-out day (or both). */
export function isCalendarDateSelectable(
  p: PublicAvailabilityPayload,
  iso: string,
): boolean {
  return isCheckInSelectable(p, iso) || isCheckOutSelectable(p, iso);
}

/**
 * True when a candidate checkout morning `checkOutExclusive` is invalid only
 * because that calendar day disallows checkout (`nocheckout` /
 * `nocheckinorcheckout`), while occupied nights, check-in rules, and min/max
 * length for this slice all pass. Used to style those cells as muted without
 * strikethrough while the guest is picking checkout.
 */
export function isCheckoutExclusiveNoCheckoutOverrideOnlyBlock(
  p: PublicAvailabilityPayload,
  checkIn: string,
  checkOutExclusive: string,
  opts?: { listingMinNights?: number | null; listingMaxNights?: number | null },
): boolean {
  if (!checkOutExclusive || checkOutExclusive <= checkIn) return false;

  const occupied = eachOccupiedNightIso(checkIn, checkOutExclusive);
  if (occupied.length === 0) return false;

  for (const d of occupied) {
    if (p.available[d] === false) return false;
  }

  const ciOv = p.override_status[checkIn] ?? "none";
  if (ciOv === "nocheckin" || ciOv === "nocheckinorcheckout") return false;

  const nights = occupied.length;
  const requiredMin = requiredMinNightsForCheckIn(p, checkIn, opts);
  if (nights < requiredMin) return false;

  const cacheMaxSingle =
    typeof p.max_stay[checkIn] === "number" && p.max_stay[checkIn] >= 1
      ? p.max_stay[checkIn]
      : Number.POSITIVE_INFINITY;
  const listingMax =
    opts?.listingMaxNights != null && opts.listingMaxNights >= 1
      ? opts.listingMaxNights
      : Number.POSITIVE_INFINITY;
  const allowedMax = Math.min(cacheMaxSingle, listingMax);
  if (Number.isFinite(allowedMax) && nights > allowedMax) return false;

  const coOv = p.override_status[checkOutExclusive] ?? "none";
  return coOv === "nocheckout" || coOv === "nocheckinorcheckout";
}

/**
 * True when every occupied night in [checkIn, checkOutExclusive) is available.
 * Used to decide whether a disabled checkout date should show strikethrough
 * (hard block due to truly unavailable nights) vs just greyed out (soft block
 * from min-stay, max-stay, or checkout override).
 */
export function allNightsAvailableInRange(
  p: PublicAvailabilityPayload,
  checkIn: string,
  checkOutExclusive: string,
): boolean {
  if (!checkOutExclusive || checkOutExclusive <= checkIn) return false;
  const occupied = eachOccupiedNightIso(checkIn, checkOutExclusive);
  for (const d of occupied) {
    if (p.available[d] === false) return false;
  }
  return true;
}

/**
 * Validates a stay [checkIn, checkOut) against cache-backed API maps.
 * Occupied nights are checkIn .. checkOut exclusive.
 */
export function validateStayAgainstSlice(
  p: PublicAvailabilityPayload,
  checkIn: string,
  checkOutExclusive: string,
  opts?: { listingMinNights?: number | null; listingMaxNights?: number | null },
): { ok: true } | { ok: false; reason: string } {
  if (!checkIn || !checkOutExclusive || checkOutExclusive <= checkIn) {
    return { ok: false, reason: "Choose a check-out after check-in." };
  }

  const occupied = eachOccupiedNightIso(checkIn, checkOutExclusive);
  if (occupied.length === 0) {
    return { ok: false, reason: "Stay must be at least one night." };
  }

  for (const d of occupied) {
    if (p.available[d] === false) {
      return { ok: false, reason: `The night of ${d} is not available.` };
    }
  }

  const ciOv = p.override_status[checkIn] ?? "none";
  if (ciOv === "nocheckin" || ciOv === "nocheckinorcheckout") {
    return { ok: false, reason: "Check-in is not allowed on that date." };
  }

  const coOv = p.override_status[checkOutExclusive] ?? "none";
  if (coOv === "nocheckout" || coOv === "nocheckinorcheckout") {
    return { ok: false, reason: "Check-out is not allowed on that date." };
  }

  const nights = occupied.length;

  const requiredMin = requiredMinNightsForCheckIn(p, checkIn, opts);
  if (nights < requiredMin) {
    return {
      ok: false,
      reason: `Minimum stay is ${requiredMin} night${requiredMin === 1 ? "" : "s"} for these dates.`,
    };
  }

  const cacheMaxSingle =
    typeof p.max_stay[checkIn] === "number" && p.max_stay[checkIn] >= 1
      ? p.max_stay[checkIn]
      : Number.POSITIVE_INFINITY;
  const listingMax =
    opts?.listingMaxNights != null && opts.listingMaxNights >= 1
      ? opts.listingMaxNights
      : Number.POSITIVE_INFINITY;
  const allowedMax = Math.min(cacheMaxSingle, listingMax);
  if (Number.isFinite(allowedMax) && nights > allowedMax) {
    return {
      ok: false,
      reason: `Maximum stay is ${allowedMax} night${allowedMax === 1 ? "" : "s"} for these dates.`,
    };
  }

  return { ok: true };
}
