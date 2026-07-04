import Image from "next/image";
import Link from "next/link";
import { DestinationCarousel } from "@/components/marketing/destination-carousel";
import { HeroSearchCard } from "@/components/hero-search-card";
import { SiteFooter } from "@/components/site-footer";
import { PromiseCardIcon } from "@/components/promise-card-icon";
import { onalaniPromises } from "@/content/site-copy";
import {
  formatPropertyLocation,
  listActiveProperties,
  type PublicProperty,
} from "@/lib/properties";

export const dynamic = "force-dynamic";

const HERO_IMAGE =
  "https://images.pexels.com/photos/338504/pexels-photo-338504.jpeg?_gl=1*173z7jl*_ga*ODY2NzE4ODIwLjE3Nzc5ODMzODI.*_ga_8JE65Q40S6*czE3Nzc5ODMzODEkbzEkZzEkdDE3Nzc5ODM3MzEkajYwJGwwJGgw";

export default async function Home() {
  let destinationProperties: PublicProperty[] = [];
  try {
    destinationProperties = await listActiveProperties();
  } catch {
    destinationProperties = [];
  }
  const locationOptions = destinationProperties.map(formatPropertyLocation);

  return (
    <>
      <div className="relative">
        <div className="relative min-h-[52vh] w-full overflow-hidden bg-[#1a1a1a] md:min-h-[560px]">
          <Image
            src={HERO_IMAGE}
            fill
            alt=""
            className="object-cover object-center"
            loading="eager"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/35 via-black/15 to-black/40"
            aria-hidden
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-5 pb-4 pt-0 md:-mt-28 md:max-w-5xl md:px-6 md:pb-12">
          <HeroSearchCard
            title="Consistently easy stays"
            subtitle="Hand-managed homes. Transparent prices. Direct booking. No platform fees."
            locationOptions={locationOptions}
          />
        </div>
      </div>

      <main>
        <section id="why-us" className="mx-auto max-w-6xl px-5 py-16 md:px-6 md:py-20">
          <h2 className="text-center font-(family-name:--font-lora) text-3xl font-medium tracking-tight text-[#2d3330] md:text-4xl">
            Why book direct with us
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[#6b7280] md:text-base">
            The promises that define every Onalani stay.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {onalaniPromises.map((item) => (
              <article
                key={item.title}
                className="flex flex-col rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm"
              >
                <PromiseCardIcon className="mb-4" />
                <h3 className="text-sm font-semibold leading-snug text-[#2d3330]">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#6b7280]">
                  {item.copy}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <Link
              href="/properties"
              className="rounded-full bg-[#d99e64] px-10 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-[#c88a52]"
            >
              Find your stay
            </Link>
          </div>
        </section>

        <section id="destinations" className="pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl px-5 md:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7280]">
                  Featured listings
                </p>
                <h2 className="mt-2 font-(family-name:--font-lora) text-2xl font-semibold text-[#2d3330] md:text-3xl">
                  Explore listings by destination
                </h2>
                <p className="mt-2 text-sm text-[#6b7280] md:text-base">
                  Swipe through available homes and open any listing to check dates.
                </p>
              </div>
              <Link
                href="/properties"
                className="rounded-full border border-[#d7d7d7] bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#2d3330] transition hover:border-[#d99e64] hover:text-[#d99e64]"
              >
                Search all
              </Link>
            </div>
          </div>

          <div className="relative mt-8 min-w-0 mx-auto max-w-6xl px-5 md:px-6">
            {destinationProperties.length === 0 ? (
              <div className="mx-auto max-w-6xl px-5 md:px-6">
                <p className="rounded-2xl border border-dashed border-[#e0e0e0] bg-white px-6 py-12 text-center text-sm text-[#6b7280]">
                  No properties are listed yet. Check back soon.
                </p>
              </div>
            ) : (
              <DestinationCarousel properties={destinationProperties} />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
