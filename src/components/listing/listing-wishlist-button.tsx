"use client";

import { WishlistSaveSheet } from "@/components/wishlist/wishlist-save-sheet";

/** Wishlist control for the public listing detail page. */
export function ListingWishlistButton({
  listingId,
  listingSlug,
}: {
  listingId: string;
  listingSlug: string;
}) {
  return (
    <WishlistSaveSheet
      listingId={listingId}
      listingSlug={listingSlug}
      variant="button"
      className="shrink-0 border-[#dddddd] bg-white hover:bg-[#fafcfb]"
    />
  );
}
