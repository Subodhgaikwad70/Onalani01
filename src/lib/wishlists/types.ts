export type WishlistListingPreview = {
  slug: string;
  photo_url?: string | null;
  unit_type: string | null;
  properties:
    | {
        slug: string;
        property_name: string | null;
        city: string | null;
        country: string | null;
      }
    | null;
};

export type WishlistItem = {
  listing_id: string;
  added_at: string;
  notes: string | null;
  listings: WishlistListingPreview | WishlistListingPreview[] | null;
};

export type GuestWishlist = {
  id: string;
  name: string;
  is_public?: boolean;
  share_token?: string | null;
  created_at?: string;
  wishlist_items?: WishlistItem[];
};

export function normalizeWishlistItemListing(
  item: WishlistItem,
): WishlistListingPreview | null {
  if (!item.listings) return null;
  return Array.isArray(item.listings) ? item.listings[0] ?? null : item.listings;
}

export function wishlistContainsListing(
  wishlist: GuestWishlist,
  listingId: string,
): boolean {
  return (wishlist.wishlist_items ?? []).some((i) => i.listing_id === listingId);
}

export function countSavedListings(wishlists: GuestWishlist[]): number {
  const ids = new Set<string>();
  for (const w of wishlists) {
    for (const item of w.wishlist_items ?? []) {
      ids.add(item.listing_id);
    }
  }
  return ids.size;
}
