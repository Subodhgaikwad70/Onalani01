"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiDelete } from "@/lib/api/client";

export function AdminDeleteConversationButton({
  conversationId,
  bookingId,
  basePath,
  onDeleted,
}: {
  conversationId: string;
  bookingId: string | null;
  basePath: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await apiDelete<{ ok: boolean }>(`/api/conversations/${conversationId}`);
      toast.success("Conversation deleted");
      onDeleted();
      router.push(basePath);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-[#717171] hover:bg-[#fff1f0] hover:text-[#c2410c]"
          aria-label="Delete conversation"
          disabled={busy}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            All messages in this thread will be permanently removed. This cannot be undone.
            {bookingId
              ? " If you message the guest about this reservation again, a new thread will be created."
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void confirmDelete();
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
