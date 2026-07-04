"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type GuestProfile = {
  id: string;
  display_name: string | null;
  phone: string | null;
  created_at: string;
};

type GuestsResponse = {
  guests: GuestProfile[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

async function fetchGuests(
  page: number,
  q: string,
): Promise<GuestsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: "25",
  });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`/api/admin/guests?${params}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: { message?: string } }).error?.message ??
        "Failed to load guests",
    );
  }
  return res.json() as Promise<GuestsResponse>;
}

function guestLabel(g: GuestProfile): string {
  return g.display_name?.trim() || "Unnamed guest";
}

type GuestPickerProps = {
  mode?: "single" | "multiple";
  selected: GuestProfile[];
  onChange: (guests: GuestProfile[]) => void;
};

export function GuestPicker({
  mode = "single",
  selected,
  onChange,
}: GuestPickerProps) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const guestsQuery = useQuery({
    queryKey: ["admin-guests", page, debouncedQ],
    queryFn: () => fetchGuests(page, debouncedQ),
    placeholderData: (prev) => prev,
  });

  const guests = guestsQuery.data?.guests ?? [];
  const total = guestsQuery.data?.total ?? 0;
  const totalPages = guestsQuery.data?.total_pages ?? 1;
  const selectedIds = new Set(selected.map((g) => g.id));

  function toggleGuest(guest: GuestProfile) {
    if (mode === "single") {
      onChange([guest]);
      return;
    }
    if (selectedIds.has(guest.id)) {
      onChange(selected.filter((g) => g.id !== guest.id));
    } else {
      onChange([...selected, guest]);
    }
  }

  function togglePage(checked: boolean) {
    if (mode !== "multiple") return;
    if (checked) {
      const merged = new Map(selected.map((g) => [g.id, g]));
      for (const g of guests) merged.set(g.id, g);
      onChange([...merged.values()]);
    } else {
      const pageIds = new Set(guests.map((g) => g.id));
      onChange(selected.filter((g) => !pageIds.has(g.id)));
    }
  }

  const pageAllSelected =
    mode === "multiple" &&
    guests.length > 0 &&
    guests.every((g) => selectedIds.has(g.id));
  const pageSomeSelected =
    mode === "multiple" &&
    guests.some((g) => selectedIds.has(g.id)) &&
    !pageAllSelected;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="guest-picker-search">Find guests</Label>
        <Input
          id="guest-picker-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Filter by name, phone, or paste a user id"
        />
        <p className="text-xs text-muted-foreground">
          Browse the guest directory or filter the list.{" "}
          {total > 0 ? `${total.toLocaleString()} guest(s) match.` : null}
        </p>
      </div>

      {mode === "multiple" && selected.length > 0 ? (
        <p className="text-sm font-medium">
          {selected.length} guest{selected.length === 1 ? "" : "s"} selected
        </p>
      ) : null}

      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {mode === "multiple" ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      pageAllSelected
                        ? true
                        : pageSomeSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => togglePage(v === true)}
                    aria-label="Select all on this page"
                  />
                </TableHead>
              ) : null}
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.map((guest) => {
              const isSelected = selectedIds.has(guest.id);
              return (
                <TableRow
                  key={guest.id}
                  className={isSelected ? "bg-accent/40" : undefined}
                >
                  {mode === "multiple" ? (
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGuest(guest)}
                        aria-label={`Select ${guestLabel(guest)}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="font-medium">{guestLabel(guest)}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {guest.id}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {guest.phone?.trim() || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {mode === "single" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => toggleGuest(guest)}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {guests.length === 0 && !guestsQuery.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={mode === "multiple" ? 4 : 3}
                  className="text-center text-sm text-muted-foreground"
                >
                  {debouncedQ
                    ? "No guests match this filter."
                    : "No guests found."}
                </TableCell>
              </TableRow>
            ) : null}
            {guestsQuery.isLoading && guests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={mode === "multiple" ? 4 : 3}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading guests…
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || guestsQuery.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || guestsQuery.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.slice(0, 8).map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
            >
              {guestLabel(g)}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${guestLabel(g)}`}
                onClick={() =>
                  onChange(selected.filter((x) => x.id !== g.id))
                }
              >
                ×
              </button>
            </span>
          ))}
          {selected.length > 8 ? (
            <span className="text-xs text-muted-foreground">
              +{selected.length - 8} more
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([])}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
