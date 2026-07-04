"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvalidateGuestWishlists } from "@/hooks/use-guest-wishlists";
import { ApiError, apiPost } from "@/lib/api/client";

type CreateWishlistDialogProps = {
  trigger?: ReactNode;
  onCreated?: (wishlistId: string) => void;
};

export function CreateWishlistDialog({
  trigger,
  onCreated,
}: CreateWishlistDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useInvalidateGuestWishlists();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a wishlist name");
      return;
    }
    setSubmitting(true);
    try {
      const { wishlist } = await apiPost<{ wishlist: { id: string; name: string } }>(
        "/api/wishlists",
        { name: trimmed, is_public: false },
      );
      toast.success(`Created "${wishlist.name}"`);
      setName("");
      setOpen(false);
      invalidate();
      onCreated?.(wishlist.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create wishlist");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" className="bg-[#5cbadf] hover:bg-[#49a8cf]">
            New wishlist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create wishlist</DialogTitle>
            <DialogDescription>
              Group stays you want to book later. You can add listings from search
              or any listing page.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="wishlist-name">Name</Label>
            <Input
              id="wishlist-name"
              className="mt-2"
              placeholder="e.g. Honeymoon ideas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
