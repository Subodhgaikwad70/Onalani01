import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingBookingCard } from "@/components/listing-booking-card";
import { ListingPhotoGallery } from "@/components/listing-photo-gallery";
import { ListingReviewsSection } from "@/components/listing/listing-reviews-section";
import { ListingWishlistButton } from "@/components/listing/listing-wishlist-button";
import { getListingBySlug, getListingPrimaryPhoto } from "@/lib/listings";
import {
  getPropertyById,
  getPropertyPrimaryPhoto,
  isValidPropertySlug,
} from "@/lib/properties";
import { getListingReviews } from "@/lib/reviews/listing-reviews";

const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=2000&q=85";

function formatLocation(property: {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
}): string | null {
  const line = [property.city, property.state, property.country]
    .filter(Boolean)
    .join(", ");
  const parts = [property.address, line, property.postal_code].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function formatArea(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2).replace(/\.?0+$/, "");
}

function formatBathrooms(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n % 1 === 0 ? String(Math.round(n)) : String(n);
}

function getMetadataNumber(
  metadata: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getUniquePhotos(...groups: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const photos: string[] = [];
  for (const group of groups) {
    for (const photo of group ?? []) {
      const url = photo.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      photos.push(url);
    }
  }
  return photos;
}

export async function ListingDetail({ slug }: { slug: string }) {
  if (!isValidPropertySlug(slug)) {
    notFound();
  }

  let listing;
  try {
    listing = await getListingBySlug(slug);
  } catch {
    return (
      <div className="bg-white text-[#2d3330]">
        <main className="mx-auto max-w-lg px-5 py-20 text-center md:px-6">
          <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-[#6b7280]">
            We could not load this listing right now. Please refresh or try
            again in a moment.
          </p>
          <Link
            href="/properties"
            className="mt-8 inline-block rounded-full bg-[#d99e64] px-8 py-3 text-xs font-bold uppercase tracking-[0.15em] text-white hover:bg-[#c88a52]"
          >
            Back to search
          </Link>
        </main>
      </div>
    );
  }

  if (!listing) {
    notFound();
  }

  let property = null;
  try {
    property = await getPropertyById(listing.property_id);
  } catch {
    property = null;
  }

  const location = property ? formatLocation(property) : null;
  const heroImage =
    getListingPrimaryPhoto(listing) ??
    (property ? getPropertyPrimaryPhoto(property) : null) ??
    FALLBACK_HERO_IMAGE;
  const galleryPhotos = getUniquePhotos(
    [heroImage],
    listing.photos_url,
    listing.roomPhotos_url,
    property?.photos_url,
  ).slice(0, 5);

  const headline =
    property != null
      ? `${property.property_name}${listing.unit_type ? ` · ${listing.unit_type}` : ""}`
      : (listing.unit_type ?? listing.slug);

  const bathLabel = formatBathrooms(listing.unit_bathrooms);
  const areaLabel = formatArea(listing.unit_area);
  const metadataNightlyRate = getMetadataNumber(listing.metadata, [
    "nightly_rate",
    "nightlyRate",
    "rate",
    "price",
    "price_per_night",
    "pricePerNight",
  ]);
  const basePriceCents = listing.base_price_cents ?? null;
  const nightlyRate =
    basePriceCents != null && basePriceCents > 0
      ? basePriceCents / 100
      : metadataNightlyRate;
  const maxGuests = listing.unit_occupancy ?? property?.max_guests ?? null;

  let reviewsSummary;
  try {
    reviewsSummary = await getListingReviews(listing.id);
  } catch {
    reviewsSummary = {
      rating_avg: listing.rating_avg ?? null,
      rating_count: listing.rating_count ?? 0,
      reviews: [],
    };
  }

  return (
    <div className="bg-white text-[#222222]">
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-(family-name:--font-lora) text-2xl font-semibold tracking-tight md:text-3xl">
              {headline}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#5c6360]">
              {location ? <span className="underline underline-offset-2">{location}</span> : null}
              {reviewsSummary.rating_count > 0 && reviewsSummary.rating_avg != null ? (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="text-[#d99e64]">
                    ★
                  </span>
                  {Number(reviewsSummary.rating_avg).toFixed(1)} · {reviewsSummary.rating_count}{" "}
                  review{reviewsSummary.rating_count === 1 ? "" : "s"}
                </span>
              ) : null}
              {maxGuests != null ? <span>Sleeps {maxGuests}</span> : null}
              {bathLabel ? <span>{bathLabel} bath{bathLabel === "1" ? "" : "s"}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ListingWishlistButton listingId={listing.id} listingSlug={slug} />
            <Link
              href="/properties"
              className="rounded-full border border-[#dddddd] px-5 py-2 text-sm font-semibold transition hover:border-[#222222]"
            >
              Back to search
            </Link>
          </div>
        </div>

        <ListingPhotoGallery
          photos={galleryPhotos}
          title={headline}
          listingId={listing.id}
          listingSlug={slug}
        />

        <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="border-b border-[#dddddd] pb-8">
              <h2 className="text-xl font-semibold md:text-2xl">
                {property?.property_name ?? "Onalani stay"} hosted direct
              </h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-[#5c6360]">
                {maxGuests != null ? <span>{maxGuests} guests</span> : null}
                {bathLabel ? <span>{bathLabel} bath{bathLabel === "1" ? "" : "s"}</span> : null}
                {areaLabel ? <span>{areaLabel} area</span> : null}
                {listing.unit_kitchen_type ? <span>{listing.unit_kitchen_type} kitchen</span> : null}
              </div>
            </div>

            <div className="border-b border-[#dddddd] py-8">
              <h2 className="text-xl font-semibold">About this place</h2>
              <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-[#4b5563]">
                {listing.unit_description ??
                  "Full listing details will appear here as they are published. This direct-booking stay is hand-managed with transparent pricing and no platform fees."}
              </p>
            </div>

            {listing.unit_amenities.length > 0 ? (
              <div className="border-b border-[#dddddd] py-8">
                <h2 className="text-xl font-semibold">What this place offers</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {listing.unit_amenities.map((item) => (
                    <div key={item} className="flex items-center gap-3 text-[#222222]">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#d99e64]">
                        +
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-b border-[#dddddd] py-8">
              <h2 className="text-xl font-semibold">Rates &amp; cancellation</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#5c6360]">
                Pick your rate when you book (like Airbnb).{" "}
                <strong>Non-refundable</strong> is the lowest price (10% off) — no
                cash refunds; 15% credits if you cancel 45+ days out, otherwise
                recovery credits only. <strong>Super Strict</strong> is the
                standard rate with reduced flexibility. <strong>Firm</strong> costs
                ~7.5% more for the most flexible cancellation terms.
              </p>
            </div>

            <ListingReviewsSection summary={reviewsSummary} />

            {property ? (
              <div className="pt-8">
                <h2 className="text-xl font-semibold">Where you&apos;ll stay</h2>
                <p className="mt-3 text-[#5c6360]">{location}</p>
                <Link
                  href={`/properties/${property.slug}`}
                  className="mt-5 inline-flex rounded-full border border-[#dddddd] px-5 py-2 text-sm font-semibold transition hover:border-[#222222]"
                >
                  View property
                </Link>
              </div>
            ) : null}
          </div>

          <ListingBookingCard
            slug={slug}
            nightlyRate={nightlyRate}
            basePriceCents={basePriceCents}
            currency={listing.currency ?? "USD"}
            maxGuests={maxGuests}
            listingMinNights={listing.min_nights ?? null}
            listingMaxNights={listing.max_nights ?? null}
          />
        </section>
      </main>
    </div>
  );
}
