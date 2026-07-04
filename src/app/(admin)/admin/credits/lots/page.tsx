"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CreditLot = {
  id: string;
  name: string;
  total_cents: number;
  remaining_cents: number;
  currency: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
};

type PaginatedLotsResponse = {
  credit_lots: CreditLot[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

const SYSTEM_LOT_PREFIX = "System issuance — ";
const PAGE_SIZE = 25;

function credits(cents: number): string {
  return (cents / 100).toLocaleString();
}

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function dateToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

async function readError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (j as { error?: { message?: string } }).error?.message ?? fallback;
}

export default function AdminCreditLotsPage() {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const [editing, setEditing] = useState<CreditLot | null>(null);
  const [deleting, setDeleting] = useState<CreditLot | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-credit-lots", page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/credits/lots?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("lots");
      return res.json() as Promise<PaginatedLotsResponse>;
    },
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amount) * 100);
      const res = await fetch("/api/admin/credits/lots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          total_cents: cents,
          currency: currency.trim().toUpperCase(),
          expires_at: dateToIso(expiresAt),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to create lot"));
    },
    onSuccess: () => {
      toast.success("Credit lot created");
      setName("");
      setAmount("");
      setCurrency("USD");
      setExpiresAt("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["admin-credit-lots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      total_cents: number;
      expires_at: string | null;
      notes: string | null;
    }) => {
      const { id, ...body } = payload;
      const res = await fetch(`/api/admin/credits/lots/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update lot"));
    },
    onSuccess: () => {
      toast.success("Credit lot updated");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-credit-lots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/credits/lots/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete lot"));
    },
    onSuccess: () => {
      toast.success("Credit lot deleted");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["admin-credit-lots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (!(Number(amount) > 0)) return toast.error("Amount must be at least 1 credit");
    createMutation.mutate();
  }

  const lots = data?.credit_lots ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
          Credit lots
        </h1>
        <p className="text-sm text-muted-foreground">
          Funding pools that back credit grants. 1 credit = $1 in the lot
          currency.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create lot</CardTitle>
          <CardDescription>
            Define a funding ceiling that grants are drawn from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="lot-name">Name</Label>
              <Input
                id="lot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q2 goodwill credits"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-currency">Currency</Label>
              <Input
                id="lot-currency"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-amount">Total credits</Label>
              <Input
                id="lot-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-expires">Expires (optional)</Label>
              <Input
                id="lot-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label htmlFor="lot-notes">Notes (optional)</Label>
              <Textarea
                id="lot-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context for finance / audit"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={createMutation.isPending}>
                Create lot
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All lots</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading…"
              : `${(data?.total ?? 0).toLocaleString()} lot(s), page ${page} of ${totalPages}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => {
                const isSystem = lot.name.startsWith(SYSTEM_LOT_PREFIX);
                const depleted = lot.remaining_cents <= 0;
                return (
                  <TableRow key={lot.id}>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">{lot.name}</div>
                      {lot.notes ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {lot.notes}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lot.currency}
                    </TableCell>
                    <TableCell className="text-right">
                      {credits(lot.total_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {credits(lot.remaining_cents)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lot.expires_at
                        ? new Date(lot.expires_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {isSystem ? (
                        <Badge variant="secondary">System</Badge>
                      ) : depleted ? (
                        <Badge variant="outline">Depleted</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSystem}
                          onClick={() => setEditing(lot)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSystem}
                          onClick={() => setDeleting(lot)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {lots.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No credit lots yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <EditLotDialog
        lot={editing}
        onClose={() => setEditing(null)}
        onSave={(payload) => updateMutation.mutate(payload)}
        saving={updateMutation.isPending}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name}. This is only possible when no grants have been
              issued from the lot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditLotDialog({
  lot,
  onClose,
  onSave,
  saving,
}: {
  lot: CreditLot | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    name: string;
    total_cents: number;
    expires_at: string | null;
    notes: string | null;
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lotId, setLotId] = useState<string | null>(null);

  if (lot && lot.id !== lotId) {
    setLotId(lot.id);
    setName(lot.name);
    setTotal(String(lot.total_cents / 100));
    setExpiresAt(dateInputValue(lot.expires_at));
    setNotes(lot.notes ?? "");
  }

  return (
    <Dialog open={Boolean(lot)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit credit lot</DialogTitle>
          <DialogDescription>
            Raising the total tops up the remaining balance. The total cannot go
            below what has already been issued.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-lot-name">Name</Label>
            <Input
              id="edit-lot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-lot-total">Total credits</Label>
            <Input
              id="edit-lot-total"
              type="number"
              min={0}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-lot-expires">Expires</Label>
            <Input
              id="edit-lot-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-lot-notes">Notes</Label>
            <Textarea
              id="edit-lot-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              lot &&
              onSave({
                id: lot.id,
                name: name.trim(),
                total_cents: Math.round(Number(total) * 100),
                expires_at: dateToIso(expiresAt),
                notes: notes.trim() || null,
              })
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
