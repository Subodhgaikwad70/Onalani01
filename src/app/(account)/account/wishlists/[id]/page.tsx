"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  useGuestWishlists,
  useInvalidateGuestWishlists,
} from "@/hooks/use-guest-wishlists";
import { normalizeWishlistItemListing } from "@/lib/wishlists/types";

export default function WishlistDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const invalidate = useInvalidateGuestWishlists();

  const { data: wishlists = [], isPending } = useGuestWishlists();
  const wishlist = wishlists.find((w) => w.id === id);
  const items = wishlist?.wishlist_items ?? [];

  const removeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await fetch(`/api/wishlists/${id}/items`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? "Remove failed");
      }
    },
    onSuccess: () => {
      toast.success("Removed from wishlist");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareMutation = useMutation({
    mutationFn: async (isPublic: boolean) => {
      const res = await fetch(`/api/wishlists/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: isPublic }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          ((j as { error?: { message?: string } }).error?.message ??
            "Unable to update wishlist visibility"),
        );
      }
    },
    onSuccess: () => {
      toast.success("Wishlist visibility updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!id) {
    return (
      <p className="text-sm text-muted-foreground">
        Invalid wishlist.
      </p>
    );
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!wishlist) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Wishlist not found.</p>
        <Link href="/account/wishlists" className="text-sm text-primary underline">
          Back to wishlists
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/account/wishlists"
            className="text-xs text-muted-foreground underline"
          >
            ← All wishlists
          </Link>
          <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
            {wishlist.name}
          </h1>
          {wishlist.is_public ? (
            <p className="text-xs text-muted-foreground">Shared list</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={Boolean(wishlist.is_public)}
              disabled={shareMutation.isPending}
              onCheckedChange={(checked) => shareMutation.mutate(checked)}
              aria-label="Toggle wishlist sharing"
            />
            <div>
              <p className="text-sm font-medium">Share wishlist</p>
              <p className="text-xs text-muted-foreground">
                Enable a share token link for this list
              </p>
            </div>
          </div>
          {wishlist.is_public && wishlist.share_token ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={async () => {
                const value = `${window.location.origin}/wishlists/${wishlist.id}?share=${wishlist.share_token}`;
                await navigator.clipboard.writeText(value);
                toast.success("Share link copied");
              }}
            >
              Copy share link
            </Button>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved stays yet.{" "}
          <Link href="/properties" className="text-primary underline">
            Search
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((row) => {
            const listing = normalizeWishlistItemListing(row);
            const slug = listing?.slug;
            const prop = listing?.properties;
            const propSingle = Array.isArray(prop) ? prop[0] : prop;
            const title =
              propSingle?.property_name?.trim() ||
              listing?.unit_type ||
              "Listing";
            const loc = [propSingle?.city, propSingle?.country]
              .filter(Boolean)
              .join(", ");

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
                <CardContent className="space-y-2 pt-4">
                  <div>
                    <p className="font-medium leading-tight">{title}</p>
                    {loc ? (
                      <p className="text-xs text-muted-foreground">{loc}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slug ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/listings/${slug}`}>View</Link>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={removeMutation.isPending}
                      onClick={() =>
                        removeMutation.mutate(row.listing_id)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
