import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroSearchCard } from "@/components/hero-search-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  getListingPrimaryPhoto,
  listListingsByPropertyId,
  type ListingRow,
} from "@/lib/listings";
import {
  getPropertyBySlug,
  getPropertyPrimaryPhoto,
  isValidPropertySlug,
} from "@/lib/properties";

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

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PropertyDetail({ slug }: { slug: string }) {
  if (!isValidPropertySlug(slug)) {
    notFound();
  }

  let property;
  try {
    property = await getPropertyBySlug(slug);
  } catch {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center md:px-6">
        <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-[#6b7280]">
          We could not load this property right now. Please refresh or try
          again in a moment.
        </p>
        <Link
          href="/properties"
          className="mt-8 inline-block rounded-full bg-[#d99e64] px-8 py-3 text-xs font-bold uppercase tracking-[0.15em] text-white hover:bg-[#c88a52]"
        >
          Back to search
        </Link>
      </main>
    );
  }

  if (!property) {
    notFound();
  }

  let availableRooms: ListingRow[] = [];
  try {
    availableRooms = await listListingsByPropertyId(property.id);
  } catch {
    availableRooms = [];
  }

  const location = formatLocation(property);
  const heroImage = getPropertyPrimaryPhoto(property) ?? FALLBACK_HERO_IMAGE;

  const searchFields = [
    ["Location", location ?? "This destination"],
    ["Check-in", "Add date"],
    ["Check-out", "Add date"],
    ["Guests", "Number of guests"],
  ] as const;

  return (
    <>
      <div className="relative">
        <div className="relative min-h-[min(52vh,480px)] overflow-hidden bg-[#1a1a1a] md:min-h-[460px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/15 to-black/45" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-5 pb-4 pt-0 md:-mt-28 md:px-6 md:pb-12">
          <HeroSearchCard
            title={property.property_name}
            subtitle={
              location
                ? `${location}. Hand-managed home with transparent pricing and direct booking.`
                : "Hand-managed home. Transparent prices. Direct booking. No platform fees."
            }
            fields={[...searchFields]}
            locationOptions={location ? [location] : []}
          />
        </div>
      </div>

      <main>
        <section id="available-rooms" className="mx-auto max-w-6xl px-5 py-16 md:px-6 md:py-20">
          <h2 className="text-center font-(family-name:--font-lora) text-3xl font-medium tracking-tight text-[#2d3330] md:text-4xl">
            Available rooms
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[#6b7280] md:text-base">
            Choose from unit types currently listed at this property.
          </p>

          {availableRooms.length === 0 ? (
            <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-dashed border-[#e0e0e0] bg-white px-6 py-12 text-center text-sm text-[#6b7280]">
              No room listings are published for this property yet.
            </div>
          ) : (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {availableRooms.map((room) => {
                const bathrooms = toNumber(room.unit_bathrooms);
                const area = toNumber(room.unit_area);
                const price = room.base_price_cents ?? 0;
                const cur = room.currency ?? "USD";
                return (
                  <Card
                    key={room.id}
                    className="overflow-hidden border-border shadow-sm transition hover:shadow-md"
                  >
                    <div
                      className="h-48 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${getListingPrimaryPhoto(room) ?? heroImage})`,
                      }}
                    />
                    <CardContent className="space-y-3 p-6">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="font-(family-name:--font-lora) text-xl font-semibold">
                          {room.unit_type ?? "Room"}
                        </h3>
                        {!room.is_active ? (
                          <Badge variant="destructive">Unavailable</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold">
                        {formatMoney(price, cur)}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          / night from
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {room.unit_occupancy != null ? (
                          <Badge variant="secondary">
                            Sleeps {room.unit_occupancy}
                          </Badge>
                        ) : null}
                        {bathrooms != null ? (
                          <Badge variant="secondary">
                            {bathrooms} bath{bathrooms === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                        {area != null ? (
                          <Badge variant="secondary">Area {area}</Badge>
                        ) : null}
                        {room.unit_kitchen_type ? (
                          <Badge variant="secondary">
                            Kitchen: {room.unit_kitchen_type}
                          </Badge>
                        ) : null}
                      </div>
                      {room.unit_description ? (
                        <p className="line-clamp-3 text-sm text-muted-foreground">
                          {room.unit_description}
                        </p>
                      ) : null}
                      {room.unit_amenities.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {room.unit_amenities.slice(0, 3).join(" · ")}
                        </p>
                      ) : null}
                      <Button className="w-full" asChild>
                        <Link href={`/listings/${room.slug}`}>
                          View room details
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-3xl border-t border-[#e8e8e8] px-5 py-14 text-center md:px-6 md:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">
            About this stay
          </p>
          <p className="mt-4 text-base leading-relaxed text-[#4b5563] md:text-lg">
            {property.description ? (
              property.description
            ) : (
              <>
                Full listing details will appear here as they are published.
                Explore{" "}
                <Link
                  href="/properties"
                  className="font-semibold text-[#d99e64] underline decoration-[#d99e64]/40 underline-offset-2"
                >
                  search
                </Link>{" "}
                to plan your trip.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!property.is_active ? (
              <span className="rounded-full bg-[#fef2f2] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#b91c1c]">
                Currently unavailable
              </span>
            ) : null}
            {property.max_guests != null ? (
              <span className="rounded-full bg-[#f3f4f6] px-4 py-2 text-sm font-semibold text-[#5c6360]">
                Up to {property.max_guests} guests
              </span>
            ) : null}
          </div>
        </section>

        {property.list_of_amenities.length > 0 ? (
          <section className="border-t border-[#eaeaea] bg-white pb-16 pt-4 md:pb-24">
            <div className="mx-auto max-w-6xl px-5 md:px-6">
              <div className="flex flex-wrap items-center gap-4 pb-8">
                <h2 className="font-(family-name:--font-lora) text-xl font-semibold md:text-2xl">
                  Amenities at this home
                </h2>
                <div className="hidden min-h-[2px] flex-1 bg-[#d1d5db] sm:block" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {property.list_of_amenities.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[#eaeaea] bg-white p-5 shadow-sm"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#d99e64]">
                      Included
                    </span>
                    <p className="mt-3 font-semibold text-[#2d3330]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-6xl px-5 pb-16 md:px-6">
          <div className="flex justify-center">
            <Link
              href="/properties"
              className="rounded-full bg-[#d99e64] px-10 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-[#c88a52]"
            >
              Find your stay
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
