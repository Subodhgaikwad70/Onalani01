import Link from "next/link";
import { HeroSearchCard } from "@/components/hero-search-card";
import {
  getListingPrimaryPhoto,
  listActiveListingsWithProperties,
  type ListingWithProperty,
} from "@/lib/listings";
import {
  formatPropertyLocation,
  getPropertyPrimaryPhoto,
  listActiveProperties,
  type PublicProperty,
} from "@/lib/properties";
import { getListingAvailabilitySlice } from "@/lib/bookings/listing-availability";
import { validateStayAgainstSlice } from "@/lib/booking/stay-validation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FALLBACK_CARD_IMAGE =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=1000&q=85";

type PropertiesPageSearchParams = {
  location?: string | string[];
  checkin?: string | string[];
  checkout?: string | string[];
  adults?: string | string[];
  children?: string | string[];
};

function readSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function toGuestCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function listingMatchesSearch({
  listing,
  locationQuery,
  guestCount,
}: {
  listing: ListingWithProperty;
  locationQuery: string;
  guestCount: number;
}): boolean {
  const property = listing.properties;
  const normalizedLocation = locationQuery.trim().toLowerCase();

  if (normalizedLocation && property) {
    const locationText = formatPropertyLocation(property);
    const searchableText = [
      property.property_name,
      locationText,
      property.address,
      property.city,
      property.state,
      property.country,
      property.postal_code,
      listing.unit_type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!searchableText.includes(normalizedLocation)) {
      return false;
    }
  }

  if (guestCount > 0) {
    const capacity = listing.unit_occupancy ?? property?.max_guests ?? null;
    if (capacity == null || capacity < guestCount) {
      return false;
    }
  }

  return true;
}

async function filterListingsByAvailability(
  listings: ListingWithProperty[],
  checkIn: string,
  checkOut: string,
): Promise<ListingWithProperty[]> {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
    return listings;
  }

  const admin = createSupabaseAdmin();
  const checked = await Promise.all(
    listings.map(async (listing) => {
      try {
        const availability = await getListingAvailabilitySlice(admin, {
          listingId: listing.id,
          from: checkIn,
          to: checkOut,
          listing: {
            id: listing.id,
            beds24_room_id: listing.beds24_room_id ?? null,
            currency: listing.currency ?? null,
            base_price_cents: listing.base_price_cents ?? null,
            min_nights: listing.min_nights ?? null,
            max_nights: listing.max_nights ?? null,
          },
        });
        const validation = validateStayAgainstSlice(
          availability,
          checkIn,
          checkOut,
          {
            listingMinNights: listing.min_nights,
            listingMaxNights: listing.max_nights,
          },
        );
        return validation.ok ? listing : null;
      } catch {
        return null;
      }
    }),
  );

  return checked.filter((listing): listing is ListingWithProperty => listing != null);
}

function propertyMatchesSearch({
  property,
  locationQuery,
}: {
  property: PublicProperty;
  locationQuery: string;
}): boolean {
  const normalizedLocation = locationQuery.trim().toLowerCase();
  if (!normalizedLocation) return true;

  const searchableText = [
    property.property_name,
    formatPropertyLocation(property),
    property.address,
    property.city,
    property.state,
    property.country,
    property.postal_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedLocation);
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams?: Promise<PropertiesPageSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locationQuery = readSearchParam(resolvedSearchParams.location);
  const checkIn = readSearchParam(resolvedSearchParams.checkin);
  const checkOut = readSearchParam(resolvedSearchParams.checkout);
  const adults = toGuestCount(readSearchParam(resolvedSearchParams.adults));
  const children = toGuestCount(readSearchParam(resolvedSearchParams.children));
  const guestCount = adults + children;
  let properties: PublicProperty[];
  let listings: ListingWithProperty[];
  try {
    [properties, listings] = await Promise.all([
      listActiveProperties(),
      listActiveListingsWithProperties(),
    ]);
  } catch {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center md:px-6">
        <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
          Could not load listings
        </h1>
        <p className="mt-3 text-sm text-[#6b7280]">
          We could not load availability right now. Please refresh or try again
          in a moment.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-[#d99e64] px-8 py-3 text-xs font-bold uppercase tracking-[0.15em] text-white hover:bg-[#c88a52]"
        >
          Back home
        </Link>
      </main>
    );
  }
  const locationOptions = properties.map(formatPropertyLocation);
  const shouldShowListings = guestCount > 0;
  const filteredProperties = properties.filter((property) =>
    propertyMatchesSearch({ property, locationQuery }),
  );
  let filteredListings = shouldShowListings
    ? listings.filter((listing) =>
        listingMatchesSearch({ listing, locationQuery, guestCount }),
      )
    : [];
  if (shouldShowListings && checkIn && checkOut) {
    filteredListings = await filterListingsByAvailability(
      filteredListings,
      checkIn,
      checkOut,
    );
  }
  const hasSearchQuery =
    locationQuery.trim().length > 0 ||
    checkIn.length > 0 ||
    checkOut.length > 0 ||
    guestCount > 0;
  const resultCount = shouldShowListings
    ? filteredListings.length
    : filteredProperties.length;
  const resultLabel = shouldShowListings ? "listing" : "property";
  const totalCount = shouldShowListings ? listings.length : properties.length;

  return (
    <>
      <div className="relative border-b border-[#eaeaea] bg-[#e8e8e8]">
        <div
          className="min-h-[220px] bg-cover bg-center md:min-h-[260px]"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/338504/pexels-photo-338504.jpeg?_gl=1*173z7jl*_ga*ODY2NzE4ODIwLjE3Nzc5ODMzODI.*_ga_8JE65Q40S6*czE3Nzc5ODMzODEkbzEkZzEkdDE3Nzc5ODM3MzEkajYwJGwwJGgw')",
          }}
        >
          <div className="min-h-[220px] bg-black/25 md:min-h-[260px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl px-5 pb-10 pt-0 md:-mt-24 md:px-6">
          <HeroSearchCard
            title="Consistently easy stays"
            subtitle="Hand-managed homes. Transparent prices. Direct booking. No platform fees."
            locationOptions={locationOptions}
            initialLocation={locationQuery}
            initialCheckIn={checkIn}
            initialCheckOut={checkOut}
            initialAdults={adults}
            initialChildren={children}
          />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e5e5e5] pb-6">
          <div>
            <h1 className="font-(family-name:--font-lora) text-2xl font-semibold md:text-3xl">
              Search stays
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#6b7280]">
              Adjust dates and guests, then explore curated homes that match the
              Onalani standard.
            </p>
          </div>
          <p className="text-sm font-medium text-[#6b7280]">
            Showing {resultCount} {resultLabel}
            {resultCount === 1 ? "" : "s"}
            {hasSearchQuery ? ` of ${totalCount}` : ""}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {["Pet friendly", "Pool", "Hot tub", "Mountain view"].map((filter) => (
            <button
              key={filter}
              type="button"
              className="rounded-full border border-[#e0e0e0] bg-white px-4 py-2 text-xs font-medium text-[#5c6360] transition hover:border-[#d99e64]/50 hover:text-[#2d3330]"
            >
              {filter}
            </button>
          ))}
        </div>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          {resultCount === 0 ? (
            <p className="col-span-full rounded-2xl border border-dashed border-[#e0e0e0] bg-white px-6 py-16 text-center text-sm text-[#6b7280]">
              {hasSearchQuery
                ? shouldShowListings
                  ? "No listings match your search. Try different dates, guests, or destination."
                  : "No properties match your search. Add guests to search available listings."
                : "No active properties are published yet. Check back soon."}
            </p>
          ) : null}
          {!shouldShowListings &&
            filteredProperties.map((property) => {
              const imageUrl =
                getPropertyPrimaryPhoto(property) ?? FALLBACK_CARD_IMAGE;
              const location = formatPropertyLocation(property);
              const guestLabel =
                property.max_guests != null
                  ? `Up to ${property.max_guests} guests`
                  : null;
              const amenityHint =
                property.list_of_amenities.length > 0
                  ? property.list_of_amenities.slice(0, 2).join(" · ")
                  : null;

              return (
                <article
                  key={property.slug}
                  className="overflow-hidden rounded-2xl border border-[#eaeaea] bg-white shadow-sm transition hover:shadow-md"
                >
                  <div
                    className="h-56 bg-cover bg-center md:h-64"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-(family-name:--font-lora) text-xl font-semibold">
                          {property.property_name}
                        </h2>
                        <p className="mt-1 text-sm text-[#6b7280]">
                          {location}
                        </p>
                      </div>
                      {guestLabel ? (
                        <span className="shrink-0 rounded-full bg-[#f5f5f5] px-3 py-1 text-xs font-semibold text-[#5c6360]">
                          {guestLabel}
                        </span>
                      ) : null}
                    </div>
                    <Link
                      href={`/properties/${property.slug}`}
                      className="mt-5 block w-full rounded-xl bg-[#d99e64] py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c88a52]"
                    >
                      See property
                    </Link>
                    <div className="mt-4 text-sm text-[#6b7280]">
                      {amenityHint ?? (
                        <span className="text-[#9ca3af]">Direct booking</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          {shouldShowListings && filteredListings.map((listing) => {
            const property = listing.properties;
            const imageUrl =
              getListingPrimaryPhoto(listing) ??
              (property ? getPropertyPrimaryPhoto(property) : null) ??
              FALLBACK_CARD_IMAGE;
            const location = property
              ? formatPropertyLocation(property)
              : "Location on request";
            const guestLabel =
              listing.unit_occupancy != null
                ? `Sleeps ${listing.unit_occupancy}`
                : property?.max_guests != null
                  ? `Up to ${property.max_guests} guests`
                  : null;
            const title =
              property?.property_name != null
                ? `${property.property_name}${listing.unit_type ? ` · ${listing.unit_type}` : ""}`
                : (listing.unit_type ?? "Stay");
            const amenityHint =
              listing.unit_amenities.length > 0
                ? listing.unit_amenities.slice(0, 3).join(" · ")
                : null;

            return (
              <article
                key={listing.id}
                className="overflow-hidden rounded-2xl border border-[#eaeaea] bg-white shadow-sm transition hover:shadow-md"
              >
                <div
                  className="h-56 bg-cover bg-center md:h-64"
                  style={{ backgroundImage: `url(${imageUrl})` }}
                />
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-(family-name:--font-lora) text-xl font-semibold">
                        {title}
                      </h2>
                      <p className="mt-1 text-sm text-[#6b7280]">
                        {location}
                      </p>
                    </div>
                    {guestLabel ? (
                      <span className="shrink-0 rounded-full bg-[#f5f5f5] px-3 py-1 text-xs font-semibold text-[#5c6360]">
                        {guestLabel}
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={`/listings/${listing.slug}`}
                    className="mt-5 block w-full rounded-xl bg-[#d99e64] py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c88a52]"
                  >
                    See availability
                  </Link>
                  <div className="mt-4 text-sm text-[#6b7280]">
                    {amenityHint ?? (
                      <span className="text-[#9ca3af]">Direct booking</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </>
  );
}
