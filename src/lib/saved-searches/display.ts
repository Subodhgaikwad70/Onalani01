import { formatDate } from "@/lib/format";

const LEGACY_QUERY_KEYS: Record<string, string> = {
  q: "location",
  from: "checkin",
  to: "checkout",
  guests: "adults",
};

export function normalizeSavedSearchQuery(
  query: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const key = LEGACY_QUERY_KEYS[k] ?? k;
    out[key] = v.trim();
  }
  return out;
}

export function savedSearchResultsHref(query: Record<string, unknown>): string {
  const params = new URLSearchParams(normalizeSavedSearchQuery(query));
  const qs = params.toString();
  return qs ? `/properties?${qs}` : "/properties";
}

function guestCount(params: Record<string, string>): number {
  const adults = Number.parseInt(params.adults ?? "0", 10);
  const children = Number.parseInt(params.children ?? "0", 10);
  const a = Number.isFinite(adults) && adults > 0 ? adults : 0;
  const c = Number.isFinite(children) && children > 0 ? children : 0;
  return a + c;
}

function formatDateRangeShort(checkin: string, checkout: string): string {
  try {
    const inD = new Date(checkin);
    const outD = new Date(checkout);
    if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) {
      return `${checkin} – ${checkout}`;
    }
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(d);
    const sameMonth =
      inD.getMonth() === outD.getMonth() &&
      inD.getFullYear() === outD.getFullYear();
    if (sameMonth) {
      const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(
        inD,
      );
      return `${month} ${inD.getDate()}–${outD.getDate()}`;
    }
    return `${fmt(inD)} – ${fmt(outD)}`;
  } catch {
    return `${checkin} – ${checkout}`;
  }
}

export type SavedSearchDisplay = {
  destination: string;
  subtext: string;
};

/** Airbnb-style title + subtext (e.g. "Miami" / "2 guests · Jul 12–18"). */
export function getSavedSearchDisplay(
  query: Record<string, unknown>,
  name?: string | null,
): SavedSearchDisplay {
  const params = normalizeSavedSearchQuery(query);
  const destination =
    params.location || name?.trim() || "Anywhere";

  const subParts: string[] = [];
  const guests = guestCount(params);
  if (guests > 0) {
    subParts.push(`${guests} guest${guests === 1 ? "" : "s"}`);
  }

  const checkin = params.checkin;
  const checkout = params.checkout;
  if (checkin && checkout) {
    subParts.push(formatDateRangeShort(checkin, checkout));
  } else if (checkin) {
    subParts.push(formatDate(checkin, "en-US", { month: "short", day: "numeric" }));
  }

  return {
    destination,
    subtext: subParts.length > 0 ? subParts.join(" · ") : "Any dates · Any guests",
  };
}

/** @deprecated Use getSavedSearchDisplay for split title/subtext. */
export function formatSavedSearchCriteria(
  query: Record<string, unknown>,
  name?: string | null,
): string {
  const { destination, subtext } = getSavedSearchDisplay(query, name);
  if (subtext === "Any dates · Any guests") return destination;
  return `${destination} · ${subtext}`;
}
