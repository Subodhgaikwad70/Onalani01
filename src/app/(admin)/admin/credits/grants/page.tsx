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
  GuestPicker,
  type GuestProfile,
} from "@/components/admin/guest-picker";

type LotRef = { id: string; name: string };
type GuestRef = { id: string; display_name: string | null };

type CreditGrant = {
  id: string;
  guest_id: string;
  lot_id: string;
  original_cents: number;
  remaining_cents: number;
  currency: string;
  status: "active" | "exhausted" | "expired" | "revoked";
  source: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  credit_lots: LotRef | null;
  profiles: GuestRef | null;
};

type LedgerEntry = {
  id: string;
  kind: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  created_at: string;
  booking_id: string | null;
};

const SOURCES = [
  "admin_grant",
  "cancellation",
  "recovery",
  "referral",
  "transfer",
  "promo",
] as const;

const STATUSES = ["active", "exhausted", "expired", "revoked"] as const;
const PAGE_SIZE = 25;

type PaginatedGrantsResponse = {
  credit_grants: CreditGrant[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

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

function statusVariant(
  status: CreditGrant["status"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "exhausted":
      return "secondary";
    case "revoked":
      return "destructive";
    default:
      return "outline";
  }
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function AdminCreditGrantsPage() {
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);

  const [selectedGuests, setSelectedGuests] = useState<GuestProfile[]>([]);
  const [lotId, setLotId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("admin_grant");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyGuest, setNotifyGuest] = useState(true);

  const [detail, setDetail] = useState<CreditGrant | null>(null);

  const lotsQuery = useQuery({
    queryKey: ["admin-credit-lots"],
    queryFn: async () => {
      const res = await fetch("/api/admin/credits/lots?limit=200", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("lots");
      return res.json() as Promise<{
        credit_lots: Array<LotRef & { currency: string }>;
      }>;
    },
  });

  const grantsQuery = useQuery({
    queryKey: ["admin-credit-grants", statusFilter, sourceFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`/api/admin/credits/grants?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("grants");
      return res.json() as Promise<PaginatedGrantsResponse>;
    },
    placeholderData: (prev) => prev,
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (selectedGuests.length === 0) throw new Error("Select at least one guest");
      const cents = Math.round(Number(amount) * 100);
      const base: Record<string, unknown> = {
        amount_cents: cents,
        source,
        expires_at: dateToIso(expiresAt),
        notes: notes.trim() || null,
        notify_guest: notifyGuest,
      };
      if (lotId) base.lot_id = lotId;
      else base.currency = currency.trim().toUpperCase();

      if (selectedGuests.length === 1) {
        const res = await fetch("/api/admin/credits/grants", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base,
            guest_id: selectedGuests[0].id,
          }),
        });
        if (!res.ok) throw new Error(await readError(res, "Failed to issue grant"));
        return { issued: 1, failed: 0 };
      }

      const res = await fetch("/api/admin/credits/grants/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          guest_ids: selectedGuests.map((g) => g.id),
        }),
      });
      const j = (await res.json()) as {
        succeeded?: Array<{ guest_id: string }>;
        failed?: Array<{ guest_id: string; message: string }>;
        error?: { message?: string };
      };
      if (!res.ok && res.status !== 207) {
        throw new Error(
          j.error?.message ??
            j.failed?.[0]?.message ??
            "Failed to issue grants",
        );
      }
      const issued = j.succeeded?.length ?? 0;
      const failed = j.failed?.length ?? 0;
      if (issued === 0) {
        throw new Error(j.failed?.[0]?.message ?? "No grants were issued");
      }
      return { issued, failed };
    },
    onSuccess: (result) => {
      if (result.failed > 0) {
        toast.warning(
          `Issued ${result.issued} grant(s); ${result.failed} failed. Check lot balance and try again for failures.`,
        );
      } else {
        toast.success(
          result.issued === 1
            ? "Credit grant issued"
            : `Credit grants issued to ${result.issued} guests`,
        );
      }
      setAmount("");
      setNotes("");
      setExpiresAt("");
      setSelectedGuests([]);
      void qc.invalidateQueries({ queryKey: ["admin-credit-grants"] });
      void qc.invalidateQueries({ queryKey: ["admin-credit-lots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onIssue(e: FormEvent) {
    e.preventDefault();
    if (selectedGuests.length === 0)
      return toast.error("Select at least one guest from the list");
    if (!(Number(amount) > 0))
      return toast.error("Amount must be at least 1 credit");
    issueMutation.mutate();
  }

  const grants = grantsQuery.data?.credit_grants ?? [];
  const lots = lotsQuery.data?.credit_lots ?? [];
  const totalPages = grantsQuery.data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
          Credit grants
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-guest credit batches. Each batch expires 12 months from issue and
          is consumed oldest-first (FIFO).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issue a grant</CardTitle>
          <CardDescription>
            Browse or filter the guest directory, select one or many guests, then
            assign whole credits from a funding lot or the system pool.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onIssue}>
            <div className="space-y-2">
              <Label>Guests</Label>
              <GuestPicker
                mode="multiple"
                selected={selectedGuests}
                onChange={setSelectedGuests}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="grant-lot">Funding lot</Label>
                <select
                  id="grant-lot"
                  className={selectClass}
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                >
                  <option value="">System issuance pool</option>
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.name}
                    </option>
                  ))}
                </select>
              </div>
              {lotId ? null : (
                <div className="space-y-2">
                  <Label htmlFor="grant-currency">Currency</Label>
                  <Input
                    id="grant-currency"
                    value={currency}
                    maxLength={3}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="grant-amount">Credits</Label>
                <Input
                  id="grant-amount"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-source">Source</Label>
                <select
                  id="grant-source"
                  className={selectClass}
                  value={source}
                  onChange={(e) =>
                    setSource(e.target.value as (typeof SOURCES)[number])
                  }
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-expires">
                  Expires (defaults to 12 months)
                </Label>
                <Input
                  id="grant-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grant-notes">Notes (optional)</Label>
              <Textarea
                id="grant-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifyGuest}
                onChange={(e) => setNotifyGuest(e.target.checked)}
              />
              Notify the guest by email and in-app
            </label>

            <Button type="submit" disabled={issueMutation.isPending}>
              {selectedGuests.length > 1
                ? `Issue to ${selectedGuests.length} guests`
                : "Issue grant"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Grants</CardTitle>
            <CardDescription>
              {grantsQuery.isLoading
                ? "Loading…"
                : `${(grantsQuery.data?.total ?? 0).toLocaleString()} grant(s), page ${page} of ${totalPages}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <select
              className={selectClass + " sm:w-40"}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className={selectClass + " sm:w-44"}
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="max-w-[200px]">
                    <div className="truncate font-medium">
                      {g.profiles?.display_name ?? "Unnamed"}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {g.guest_id}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm">
                    {g.credit_lots?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {g.source.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {credits(g.original_cents)} {g.currency}
                  </TableCell>
                  <TableCell className="text-right">
                    {credits(g.remaining_cents)} {g.currency}
                  </TableCell>
                  <TableCell className="text-sm">
                    {g.expires_at
                      ? new Date(g.expires_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(g.status)}>{g.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetail(g)}
                    >
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {grants.length === 0 && !grantsQuery.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No grants match these filters.
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
                  disabled={page <= 1 || grantsQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || grantsQuery.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <GrantDetailDialog
        grant={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          void qc.invalidateQueries({ queryKey: ["admin-credit-grants"] });
        }}
      />
    </div>
  );
}

function GrantDetailDialog({
  grant,
  onClose,
  onChanged,
}: {
  grant: CreditGrant | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [grantId, setGrantId] = useState<string | null>(null);

  if (grant && grant.id !== grantId) {
    setGrantId(grant.id);
    setExpiresAt(dateInputValue(grant.expires_at));
    setNotes(grant.notes ?? "");
  }

  const detailQuery = useQuery({
    queryKey: ["admin-credit-grant", grant?.id],
    enabled: Boolean(grant),
    queryFn: async () => {
      const res = await fetch(`/api/admin/credits/grants/${grant!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("grant");
      return res.json() as Promise<{
        credit_grant: CreditGrant;
        ledger: LedgerEntry[];
      }>;
    },
  });

  async function patch(body: Record<string, unknown>, successMsg: string) {
    if (!grant) return;
    const res = await fetch(`/api/admin/credits/grants/${grant.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(await readError(res, "Update failed"));
      return;
    }
    toast.success(successMsg);
    onChanged();
    void detailQuery.refetch();
  }

  const ledger = detailQuery.data?.ledger ?? [];
  const canModify = grant ? grant.status !== "revoked" : false;

  return (
    <Dialog open={Boolean(grant)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage credit grant</DialogTitle>
          <DialogDescription>
            {grant?.profiles?.display_name ?? "Guest"} ·{" "}
            {grant ? credits(grant.remaining_cents) : 0} of{" "}
            {grant ? credits(grant.original_cents) : 0} {grant?.currency} remaining
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="detail-expires">Expiry date</Label>
              <Input
                id="detail-expires"
                type="date"
                value={expiresAt}
                disabled={!canModify}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-notes">Notes</Label>
              <Input
                id="detail-notes"
                value={notes}
                disabled={!canModify}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!canModify}
              onClick={() =>
                patch(
                  { expires_at: dateToIso(expiresAt), notes: notes.trim() || null },
                  "Grant updated",
                )
              }
            >
              Save changes
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!canModify}
              onClick={() => {
                if (
                  confirm(
                    "Revoke this grant? Remaining credits are returned to the lot and removed from the guest.",
                  )
                ) {
                  patch({ status: "revoked" }, "Grant revoked");
                }
              }}
            >
              Revoke grant
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Transaction history</h3>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.kind.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {entry.amount_cents >= 0 ? "+" : ""}
                        {credits(entry.amount_cents)} {entry.currency}
                      </TableCell>
                    </TableRow>
                  ))}
                  {ledger.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-xs text-muted-foreground"
                      >
                        {detailQuery.isLoading
                          ? "Loading…"
                          : "No ledger entries for this batch."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
