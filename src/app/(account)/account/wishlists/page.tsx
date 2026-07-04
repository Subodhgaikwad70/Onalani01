"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWishlistDialog } from "@/components/wishlist/create-wishlist-dialog";
import { useGuestWishlists } from "@/hooks/use-guest-wishlists";
import {
  countSavedListings,
  normalizeWishlistItemListing,
} from "@/lib/wishlists/types";

export default function WishlistsPage() {
  const { data: wishlists = [], isPending } = useGuestWishlists();

  const totalSaved = countSavedListings(wishlists);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold">
            Wishlists
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Save stays from search or listing pages.{" "}
            {totalSaved > 0
              ? `${totalSaved} unique listing${totalSaved === 1 ? "" : "s"} saved across your lists.`
              : "Your saved listings appear here."}
          </p>
        </div>
        <CreateWishlistDialog />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : wishlists.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Heart className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">No wishlists yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a list, then tap the heart on any stay to save it.
              </p>
            </div>
            <CreateWishlistDialog
              trigger={
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline"
                >
                  Create your first wishlist
                </button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {wishlists.map((w) => {
            const items = w.wishlist_items ?? [];
            const previews = items
              .slice(0, 4)
              .map((item) => normalizeWishlistItemListing(item))
              .filter(Boolean);

            return (
              <Card
                key={w.id}
                className="overflow-hidden transition-colors hover:bg-muted/40"
              >
                {previews.length > 0 ? (
                  <div className="grid grid-cols-4 gap-0.5 bg-muted">
                    {previews.map((listing, i) => (
                      <div
                        key={`${w.id}-preview-${i}`}
                        className="aspect-[4/3] bg-cover bg-center"
                        style={{
                          backgroundImage: listing?.photo_url
                            ? `url(${listing.photo_url})`
                            : undefined,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex aspect-[2/1] items-center justify-center bg-muted/60 text-muted-foreground">
                    <Heart className="h-8 w-8 opacity-40" />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    <Link
                      href={`/account/wishlists/${w.id}`}
                      className="hover:underline"
                    >
                      {w.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {items.length} saved listing
                  {items.length === 1 ? "" : "s"}
                  {w.is_public ? " · Shared" : ""}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Link href="/properties" className="inline-block text-sm text-primary underline">
        Search
      </Link>
    </div>
  );
}
