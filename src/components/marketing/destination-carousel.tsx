"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatPropertyLocation,
  getPropertyPrimaryPhoto,
  type PublicProperty,
} from "@/lib/properties";

const FALLBACK_CARD_IMAGE =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=900&q=85";

export function DestinationCarousel({ properties }: { properties: PublicProperty[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollStep = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return 340;
    const first = root.querySelector<HTMLElement>("article[data-carousel-card]");
    if (!first) return 340;
    /** Matches Tailwind `gap-5` (1.25rem ≈ 20px at default root font size). */
    const gapPx = 20;
    return first.offsetWidth + gapPx;
  }, []);

  const scrollPrev = useCallback(() => {
    scrollerRef.current?.scrollBy({ left: -scrollStep(), behavior: "smooth" });
  }, [scrollStep]);

  const scrollNext = useCallback(() => {
    scrollerRef.current?.scrollBy({ left: scrollStep(), behavior: "smooth" });
  }, [scrollStep]);

  return (
    <div className="relative w-full min-w-0 max-w-full">
      <div className="pointer-events-none absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 md:block">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto h-10 w-10 rounded-full border border-[#e2e8e4] bg-white/95 text-[#2d3330] shadow-md backdrop-blur-sm hover:bg-white"
          aria-label="Scroll destinations left"
          onClick={scrollPrev}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
      <div className="pointer-events-none absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 md:block">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto h-10 w-10 rounded-full border border-[#e2e8e4] bg-white/95 text-[#2d3330] shadow-md backdrop-blur-sm hover:bg-white"
          aria-label="Scroll destinations right"
          onClick={scrollNext}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        role="region"
        aria-label="Featured destinations"
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 pb-4 pt-1 scroll-pl-5 scroll-pr-5 scroll-smooth outline-none focus-visible:ring-2 focus-visible:ring-[#6ba8c4]/50 focus-visible:ring-offset-2 md:px-6 md:scroll-pl-6 md:scroll-pr-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {properties.map((property) => {
          const imageUrl =
            getPropertyPrimaryPhoto(property) ?? FALLBACK_CARD_IMAGE;
          const location = formatPropertyLocation(property);
          const amenityPreview =
            property.list_of_amenities.length > 0
              ? property.list_of_amenities.slice(0, 2).join(" · ")
              : null;

          return (
            <article
              key={property.slug}
              data-carousel-card
              className="w-[272px] shrink-0 snap-start sm:w-[300px] md:w-[320px]"
            >
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e7e7e7] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div
                  className="relative h-52 shrink-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${imageUrl})` }}
                >
                  <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
                  <p className="absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/95">
                    Destination
                  </p>
                  <h3 className="absolute bottom-4 left-4 right-4 font-(family-name:--font-lora) text-xl font-semibold leading-tight text-white drop-shadow-sm">
                    {property.property_name}
                  </h3>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-sm font-medium text-[#2d3330]">{location}</p>
                  {amenityPreview ? (
                    <p className="mt-2 line-clamp-2 text-xs text-[#7b8381]">
                      {amenityPreview}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[#7b8381]">
                      Direct booking · no platform fees
                    </p>
                  )}
                  {property.max_guests != null ? (
                    <p className="mt-3 text-sm font-semibold text-[#2d3330]">
                      Up to {property.max_guests} guests
                    </p>
                  ) : null}
                  <Link
                    href={`/properties/${property.slug}`}
                    className="mt-auto block w-full rounded-xl bg-[#d99e64] py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c88a52]"
                  >
                    See availability
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
        {/* End inset so the last card clears the fade / viewport edge */}
        <div className="w-4 shrink-0 sm:w-6 md:w-8" aria-hidden />
      </div>
    </div>
  );
}
