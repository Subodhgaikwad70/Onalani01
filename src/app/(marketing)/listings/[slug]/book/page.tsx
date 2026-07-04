import { notFound } from "next/navigation";
import { BookListingClient } from "@/components/booking/book-listing-client";
import type { BookingListingSummary } from "@/components/booking/booking-stay-summary";
import { getListingBySlug, getListingPrimaryPhoto } from "@/lib/listings";
import { getListingCancellationPolicy } from "@/lib/bookings/load-cancellation-policy";
import { getPropertyById, getPropertyPrimaryPhoto } from "@/lib/properties";
import { isCancellationPolicyKey, GUEST_CHECKOUT_DEFAULT_POLICY_KEY } from "@/lib/bookings/cancellation-policies";

export const dynamic = "force-dynamic";

const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=1200&q=85";

function formatLocation(property: {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}): string | null {
  const line = [property.city, property.state, property.country]
    .filter(Boolean)
    .join(", ");
  const parts = [property.address, line].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default async function BookListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const listingRow = await getListingBySlug(slug);
  if (!listingRow) notFound();

  const property = await getPropertyById(listingRow.property_id).catch(() => null);
  const heroImage =
    getListingPrimaryPhoto(listingRow) ??
    (property ? getPropertyPrimaryPhoto(property) : null) ??
    FALLBACK_HERO_IMAGE;

  const listingSummary: BookingListingSummary = {
    slug,
    title:
      property != null
        ? `${property.property_name}${listingRow.unit_type ? ` · ${listingRow.unit_type}` : ""}`
        : (listingRow.unit_type ?? slug),
    location: property ? formatLocation(property) : null,
    imageUrl: heroImage,
  };

  const checkIn =
    typeof sp.check_in === "string"
      ? sp.check_in
      : typeof sp.checkIn === "string"
        ? sp.checkIn
        : "";
  const checkOut =
    typeof sp.check_out === "string"
      ? sp.check_out
      : typeof sp.checkOut === "string"
        ? sp.checkOut
        : "";
  const adultsRaw =
    typeof sp.adults === "string"
      ? sp.adults
      : typeof sp.guests === "string"
        ? sp.guests
        : "2";
  const childrenRaw = typeof sp.children === "string" ? sp.children : "0";
  const cancellationPolicy =
    typeof sp.cancellation_policy === "string"
      ? sp.cancellation_policy
      : typeof sp.cancellationPolicy === "string"
        ? sp.cancellationPolicy
        : null;
  const adults = Math.max(1, Number(adultsRaw) || 2);
  const children = Math.max(0, Number(childrenRaw) || 0);
  const maxGuests = listingRow.unit_occupancy ?? property?.max_guests ?? null;

  const instantBookEnabled = Boolean(
    listingRow.instant_book && property?.instant_book,
  );

  const propertyPolicy = await getListingCancellationPolicy(slug);
  const initialPolicy =
    isCancellationPolicyKey(cancellationPolicy)
      ? cancellationPolicy
      : isCancellationPolicyKey(propertyPolicy?.key)
        ? propertyPolicy.key
        : GUEST_CHECKOUT_DEFAULT_POLICY_KEY;

  return (
    <BookListingClient
      slug={slug}
      listing={listingSummary}
      initialCheckIn={checkIn}
      initialCheckOut={checkOut}
      initialAdults={adults}
      initialChildren={children}
      maxGuests={maxGuests}
      instantBookEnabled={instantBookEnabled}
      initialCancellationPolicy={initialPolicy}
    />
  );
}
