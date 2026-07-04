"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Heart, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGuestWishlists,
  useInvalidateGuestWishlists,
} from "@/hooks/use-guest-wishlists";
import { ApiError, apiPost } from "@/lib/api/client";
import { wishlistContainsListing } from "@/lib/wishlists/types";
import { useSupabaseSession } from "@/lib/supabase/session-context";
import { cn } from "@/lib/utils";

type WishlistSaveSheetProps = {
  listingId: string;
  /** Used for login redirect when guest is signed out */
  listingSlug?: string;
  /** Icon-only overlay (e.g. search cards) vs labeled button (listing page) */
  variant?: "icon" | "button";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function WishlistSaveSheet({
  listingId,
  listingSlug,
  variant = "button",
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = true,
}: WishlistSaveSheetProps) {
  const { user } = useSupabaseSession();
  const [internalOpen, setInternalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const loggedIn = Boolean(user?.email);
  const { data: wishlists = [], isPending } = useGuestWishlists(loggedIn);
  const invalidate = useInvalidateGuestWishlists();

  const savedInCount = useMemo(
    () => wishlists.filter((w) => wishlistContainsListing(w, listingId)).length,
    [wishlists, listingId],
  );

  const loginHref = listingSlug
    ? `/auth/login?next=/listings/${listingSlug}`
    : "/auth/login?next=/account/wishlists";

  async function toggleListing(wishlistId: string, currentlySaved: boolean) {
    setBusyId(wishlistId);
    try {
      if (currentlySaved) {
        const res = await fetch(`/api/wishlists/${wishlistId}/items`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listing_id: listingId }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new ApiError(
            res.status,
            (j as { error?: { message?: string } }).error?.message ??
              "Could not remove",
          );
        }
        toast.success("Removed from wishlist");
      } else {
        await apiPost(`/api/wishlists/${wishlistId}/items`, {
          listing_id: listingId,
        });
        toast.success("Saved to wishlist");
      }
      invalidate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function createWishlistAndSave(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) {
      toast.error("Enter a wishlist name");
      return;
    }
    setCreating(true);
    try {
      const { wishlist } = await apiPost<{ wishlist: { id: string } }>(
        "/api/wishlists",
        { name, is_public: false },
      );
      await apiPost(`/api/wishlists/${wishlist.id}/items`, {
        listing_id: listingId,
      });
      setNewListName("");
      toast.success(`Created "${name}" and saved this stay`);
      invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create wishlist");
    } finally {
      setCreating(false);
    }
  }

  function handleTriggerClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!loggedIn) {
      setOpen(true);
      return;
    }
    setOpen(true);
  }

  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        aria-label={
          savedInCount > 0 ? "Saved to wishlist" : "Save to wishlist"
        }
        onClick={handleTriggerClick}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 shadow-sm transition hover:scale-105 hover:bg-white",
          savedInCount > 0 && "text-rose-600",
          className,
        )}
      >
        <Heart
          className={cn("h-4 w-4", savedInCount > 0 && "fill-current")}
        />
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        className={cn("flex-1 gap-2", className)}
        onClick={handleTriggerClick}
      >
        <Heart
          className={cn("h-4 w-4", savedInCount > 0 && "fill-rose-600 text-rose-600")}
        />
        {savedInCount > 0 ? "Saved" : "Wishlist"}
      </Button>
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {showTrigger ? trigger : null}
      <SheetContent onClick={(e) => e.stopPropagation()}>
        <SheetHeader>
          <SheetTitle>Save to wishlist</SheetTitle>
          <SheetDescription>
            Choose a list or create a new one. Your wishlists are private unless
            you share them.
          </SheetDescription>
        </SheetHeader>

        {!loggedIn ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Link href={loginHref} className="font-medium text-primary underline">
              Log in
            </Link>{" "}
            to save stays you love.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {isPending ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="max-h-[40vh] pr-4">
                <div className="space-y-2">
                  {wishlists.map((w) => {
                    const saved = wishlistContainsListing(w, listingId);
                    const count = w.wishlist_items?.length ?? 0;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => void toggleListing(w.id, saved)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition",
                          saved
                            ? "border-rose-200 bg-rose-50/80"
                            : "border-border bg-muted/30 hover:bg-muted/60",
                        )}
                      >
                        <span>
                          <span className="font-medium">{w.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {count} listing{count === 1 ? "" : "s"}
                          </span>
                        </span>
                        {busyId === w.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : saved ? (
                          <Check className="h-4 w-4 shrink-0 text-rose-600" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                  {wishlists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No wishlists yet — create one below.
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            )}

            <form onSubmit={createWishlistAndSave} className="space-y-3 border-t pt-4">
              <Label htmlFor="new-wishlist-name">New wishlist</Label>
              <div className="flex gap-2">
                <Input
                  id="new-wishlist-name"
                  placeholder="e.g. Summer trip"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  maxLength={120}
                  disabled={creating}
                />
                <Button type="submit" disabled={creating} className="shrink-0">
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              <Link href="/account/wishlists" className="underline">
                Manage all wishlists
              </Link>
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
