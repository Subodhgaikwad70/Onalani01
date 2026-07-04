import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listingWithLegacyPhotoUrl } from "@/lib/listings";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWishlistItemListing, type WishlistItem } from "@/lib/wishlists/types";

type WishlistSharePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ share?: string | string[] }>;
};

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function WishlistSharePage({
  params,
  searchParams,
}: WishlistSharePageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = readParam(resolvedSearchParams.share);
  if (!shareToken) notFound();

  const admin = createSupabaseAdmin();
  const { data: wishlist, error } = await admin
    .from("wishlists")
    .select(
      "id, name, is_public, share_token, wishlist_items(listing_id, added_at, notes, listings(slug, photos_url, roomPhotos_url, unit_type, properties(slug, property_name, city, country)))",
    )
    .eq("id", id)
    .eq("is_public", true)
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error || !wishlist) notFound();

  const items = ((wishlist.wishlist_items ?? []) as unknown[]).map((raw) => {
    const item = raw as Record<string, unknown>;
    const listing = item.listings as Record<string, unknown> | undefined;
    return {
      ...item,
      listings: listing ? listingWithLegacyPhotoUrl(listing) : null,
    } as unknown as WishlistItem;
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e5e5e5] pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Shared wishlist
          </p>
          <h1 className="mt-2 font-(family-name:--font-lora) text-3xl font-semibold text-[#1f2937]">
            {wishlist.name}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/properties">Search stays</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-[#e0e0e0] bg-white px-6 py-16 text-center text-sm text-[#6b7280]">
          This shared wishlist does not have any saved stays yet.
        </p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((row) => {
            const listing = normalizeWishlistItemListing(row);
            const prop = listing?.properties;
            const property = Array.isArray(prop) ? prop[0] : prop;
            const title =
              property?.property_name?.trim() || listing?.unit_type || "Listing";
            const loc = [property?.city, property?.country].filter(Boolean).join(", ");

            return (
              <Card key={row.listing_id} className="overflow-hidden">
                <div className="relative aspect-4/3 bg-muted">
                  {listing?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote storage URLs vary by env
                    <img
                      src={listing.photo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <CardContent className="space-y-3 pt-4">
                  <div>
                    <p className="font-medium leading-tight">{title}</p>
                    {loc ? (
                      <p className="text-xs text-muted-foreground">{loc}</p>
                    ) : null}
                  </div>
                  {listing?.slug ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/listings/${listing.slug}`}>View stay</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
