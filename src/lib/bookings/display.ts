import { getListingPrimaryPhoto } from "@/lib/listings";
import type { PricingBreakdown } from "@/lib/bookings/pricing";
import type { CancellationRule } from "@/lib/bookings/cancellation";

export type BookingPropertyEmbed = {
  slug: string;
  property_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  photos_url: string[] | null;
};

export type BookingListingEmbed = {
  slug: string;
  unit_type?: string | null;
  min_nights?: number | null;
  max_nights?: number | null;
  unit_occupancy?: number | null;
  photos_url: string[] | null;
  roomPhotos_url?: string[] | null;
  properties: BookingPropertyEmbed | null;
};

/** Booking row returned from GET /api/bookings with nested listing + property. */
export type GuestBookingWithListing = {
  id: string;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  listing_id: string;
  guest_profile?: { display_name: string } | null;
  total_cents: number;
  currency: string;
  service_fee_cents?: number | null;
  credit_applied_cents?: number | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  pets?: number | null;
  created_at: string;
  updated_at?: string;
  guest_notes?: string | null;
  pricing_breakdown: unknown;
  cancellation_policy_snapshot: {
    key?: string;
    label?: string;
    rules?: CancellationRule[];
  } | null;
  payment_card_last4?: string | null;
  payment_card_brand?: string | null;
  payment_provider?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  promo_discount_cents?: number | null;
  listings?: BookingListingEmbed | BookingListingEmbed[] | null;
  /** Set on GET /api/bookings for the signed-in guest. */
  guest_listing_review_submitted?: boolean;
};

function normalizeListingRow(
  raw: GuestBookingWithListing["listings"],
): BookingListingEmbed | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function bookingListing(
  booking: GuestBookingWithListing,
): BookingListingEmbed | null {
  return normalizeListingRow(booking.listings);
}

export function bookingThumbnail(booking: GuestBookingWithListing): string | null {
  const listing = bookingListing(booking);
  if (!listing) return null;
  const fromListing = getListingPrimaryPhoto(listing);
  if (fromListing) return fromListing;
  const prop = listing.properties;
  const fromProp = prop?.photos_url?.find((u) => u.trim().length > 0);
  return fromProp ?? null;
}

export function bookingStayTitle(booking: GuestBookingWithListing): string {
  return bookingListing(booking)?.properties?.property_name ?? "Your stay";
}

/** Host-facing listing column: property name + unit title when present. */
export function hostReservationListingTitle(booking: GuestBookingWithListing): string {
  const L = bookingListing(booking);
  const propName = L?.properties?.property_name?.trim();
  const unit = L?.unit_type?.trim();
  if (propName && unit) return `${propName}: ${unit}`;
  if (propName) return propName;
  if (unit) return unit;
  return L?.slug ?? "Listing";
}

export function bookingAddressLines(booking: GuestBookingWithListing): {
  street: string | null;
  cityLine: string;
} {
  const p = bookingListing(booking)?.properties;
  if (!p) return { street: null, cityLine: "" };
  const cityLine = [p.city, p.state, p.country].filter(Boolean).join(", ");
  return { street: p.address ?? null, cityLine };
}

export function bookingMapsUrl(booking: GuestBookingWithListing): string | null {
  const p = bookingListing(booking)?.properties;
  if (!p) return null;
  if (p.latitude != null && p.longitude != null) {
    return `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
  }
  const q = [p.address, p.city, p.state, p.country].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function bookingListingHref(booking: GuestBookingWithListing): string | null {
  const slug = bookingListing(booking)?.slug;
  return slug ? `/listings/${slug}` : null;
}

export function parsePricingBreakdown(
  raw: unknown,
): PricingBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<PricingBreakdown>;
  if (typeof o.total_cents !== "number" || typeof o.currency !== "string") {
    return null;
  }
  return raw as PricingBreakdown;
}
