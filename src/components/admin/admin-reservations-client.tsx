"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  MoreHorizontal,
  Printer,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import {
  type GuestBookingWithListing,
  bookingListingHref,
  hostReservationListingTitle,
} from "@/lib/bookings/display";
import { formatDate, formatMoney } from "@/lib/format";
import { ensureBookingConversation } from "@/lib/messaging/ensure-booking-conversation";
import { cn } from "@/lib/utils";

type TabId = "upcoming" | "completed" | "cancelled" | "all";
type SortKey = "check_in" | "check_out";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 25;

type BookingsResponse = {
  bookings: GuestBookingWithListing[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hostStatusLabel(row: GuestBookingWithListing): string {
  const today = todayIsoUtc();
  const { status, check_in, check_out } = row;
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "requested") return "Pending approval";
  if (status === "confirmed" || status === "in_stay") {
    if (today >= check_in && today < check_out) return "Currently hosting";
    if (today === check_out) return "Checking out today";
    if (today < check_in) return "Confirmed";
  }
  if (status === "in_stay") return "Currently hosting";
  if (status === "completed") return "Completed";
  if (status === "cancelled_by_guest") return "Cancelled by guest";
  if (status === "cancelled_by_admin") return "Cancelled by you";
  if (status === "cancelled_by_admin") return "Cancelled by admin";
  if (status === "expired") return "Expired";
  if (status === "declined") return "Declined";
  return status.replace(/_/g, " ");
}

function tabMatches(tab: TabId, row: GuestBookingWithListing): boolean {
  const today = todayIsoUtc();
  switch (tab) {
    case "upcoming":
      if (
        [
          "completed",
          "cancelled_by_guest",
          "cancelled_by_admin",
          "cancelled_by_admin",
          "expired",
          "declined",
        ].includes(row.status)
      ) {
        return false;
      }
      return row.check_out >= today;
    case "completed":
      return row.status === "completed";
    case "cancelled":
      return [
        "cancelled_by_guest",
        "cancelled_by_admin",
        "cancelled_by_admin",
        "expired",
        "declined",
      ].includes(row.status);
    case "all":
    default:
      return true;
  }
}

function guestCountLabel(row: GuestBookingWithListing): string {
  const adults = row.adults ?? 0;
  const children = row.children ?? 0;
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
  if (children > 0)
    parts.push(`${children} child${children === 1 ? "" : "ren"}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function formatBookedAt(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportReservationsCsv(rows: GuestBookingWithListing[]) {
  const headers = [
    "Status",
    "Guest",
    "Guests",
    "Check-in",
    "Checkout",
    "Booked",
    "Listing",
    "Code",
    "Total (guest)",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        csvEscape(hostStatusLabel(r)),
        csvEscape(r.guest_profile?.display_name?.trim() || "Guest"),
        csvEscape(guestCountLabel(r)),
        csvEscape(r.check_in),
        csvEscape(r.check_out),
        csvEscape(formatBookedAt(r.created_at)),
        csvEscape(hostReservationListingTitle(r)),
        csvEscape(r.code),
        csvEscape(String((r.total_cents ?? 0) / 100)),
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `onalani-reservations-${todayIsoUtc()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminBookingsClient() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("upcoming");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchQuery = deferredSearch.trim();
  const [sortKey, setSortKey] = useState<SortKey>("check_in");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const { data, isFetching, isPending } = useQuery({
    queryKey: ["host-bookings", tab, page, sortKey, sortDir, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        scope: "admin",
        page: String(page),
        limit: String(PAGE_SIZE),
        sort: sortKey,
        dir: sortDir,
      });
      if (tab !== "all") params.set("view", tab);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/bookings?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("bookings");
      return res.json() as Promise<BookingsResponse>;
    },
    placeholderData: (prev) => prev,
  });

  const filtered = useMemo(() => {
    const rows = data?.bookings ?? [];
    let list = rows.filter((r) => tabMatches(tab, r));
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data?.bookings, tab, sortKey, sortDir]);
  const totalPages = data?.total_pages ?? 1;

  function printTable() {
    window.print();
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "completed", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="host-reservations print:bg-white">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
            <Link href="/admin" aria-label="Back to admin home">
              <ArrowLeft className="h-5 w-5 text-[#222222]" />
            </Link>
          </Button>
          <div>
            <h1 className="font-(family-name:--font-lora) text-2xl font-semibold tracking-tight text-[#222222] md:text-3xl">
              Reservations
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[#717171]">
              Review upcoming stays, payouts, and guest details. Export or print for your records.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 h-4 w-4 text-[#717171]"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Guest, listing, or code"
              aria-label="Search reservations"
              className="h-10 w-[160px] rounded-full border-[#dddddd] bg-white pl-9 text-sm md:w-[220px]"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 border-[#dddddd] bg-white text-[#222222]"
              >
                Export
                <ChevronDown className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={filtered.length === 0}
                onClick={() => exportReservationsCsv(filtered)}
              >
                Download current page CSV ({filtered.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-[#dddddd] bg-white text-[#222222]"
            onClick={printTable}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-6 border-b border-[#ebebeb] print:hidden">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cn(
                "relative pb-3 text-sm font-semibold transition-colors",
                active ? "text-[#222222]" : "text-[#717171] hover:text-[#222222]",
              )}
            >
              {t.label}
              {active ? (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#5cbadf]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-[#717171]">
          {isPending
            ? "Loading reservations..."
            : `${(data?.total ?? 0).toLocaleString()} reservation(s), page ${page} of ${totalPages}`}
        </p>
        {totalPages > 1 ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#ebebeb] bg-white shadow-sm print:border-0 print:shadow-none">
        {isPending ? (
          <p className="p-8 text-sm text-muted-foreground">Loading reservations…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground">
            No reservations in this tab{search.trim() ? " matching your search" : ""}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#ebebeb] hover:bg-transparent">
                <TableHead className="min-w-[140px] font-semibold text-[#222222]">
                  Status
                </TableHead>
                <TableHead className="min-w-[140px] font-semibold text-[#222222]">
                  Guests
                </TableHead>
                <TableHead
                  className="min-w-[108px] font-semibold text-[#222222]"
                  aria-sort={
                    sortKey === "check_in"
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-[#1e6a82]"
                    onClick={() => toggleSort("check_in")}
                  >
                    Check-in
                    {sortKey === "check_in" ? (
                      sortDir === "asc" ? (
                        <ArrowDown className="h-3.5 w-3.5 opacity-70" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5 opacity-70" />
                      )
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 opacity-30" />
                    )}
                  </button>
                </TableHead>
                <TableHead
                  className="min-w-[108px] font-semibold text-[#222222]"
                  aria-sort={
                    sortKey === "check_out"
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-[#1e6a82]"
                    onClick={() => toggleSort("check_out")}
                  >
                    Check-out
                    {sortKey === "check_out" ? (
                      sortDir === "asc" ? (
                        <ArrowDown className="h-3.5 w-3.5 opacity-70" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5 opacity-70" />
                      )
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 opacity-30" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="hidden min-w-[160px] font-semibold text-[#222222] xl:table-cell">
                  Booked
                </TableHead>
                <TableHead className="min-w-[108px] font-semibold text-[#222222]">
                  Confirmation Code
                  </TableHead>
                <TableHead className="min-w-[200px] font-semibold text-[#222222]">
                  Listing
                </TableHead>
                <TableHead className="hidden font-semibold text-[#222222] lg:table-cell">
                  Code
                </TableHead>
                <TableHead className="min-w-[100px] text-right font-semibold text-[#222222]">
                  Total
                </TableHead>
                <TableHead className="w-[120px] print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const listingHref = bookingListingHref(r);
                const guestName = r.guest_profile?.display_name?.trim() || "Guest";
                const sf = r.service_fee_cents ?? 0;
                const estPayout = Math.max(0, (r.total_cents ?? 0) - sf);

                return (
                  <TableRow key={r.id} className="border-[#ebebeb]">
                    <TableCell className="align-top text-sm text-[#222222]">
                      {hostStatusLabel(r)}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/admin/bookings/${r.code}`}
                          className="font-medium text-[#1e6a82] hover:underline"
                        >
                          {guestName}
                        </Link>
                        <span className="text-xs text-[#717171]">{guestCountLabel(r)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-sm text-[#222222]">
                      {formatDate(r.check_in)}
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-sm text-[#222222]">
                      {formatDate(r.check_out)}
                    </TableCell>
                    <TableCell className="hidden align-top text-sm text-[#717171] xl:table-cell">
                      {formatBookedAt(r.created_at)}
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-sm text-[#222222]">{r.code}</TableCell>
                    <TableCell className="align-top">
                      {listingHref ? (
                        <Link
                          href={listingHref}
                          className="text-sm text-[#222222] underline-offset-4 hover:text-[#1e6a82] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {hostReservationListingTitle(r)}
                        </Link>
                      ) : (
                        <span className="text-sm text-[#222222]">
                          {hostReservationListingTitle(r)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top font-mono text-xs text-[#717171] lg:table-cell">
                      {r.code}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="text-sm font-semibold tabular-nums text-[#222222]">
                        {formatMoney(r.total_cents ?? 0, r.currency)}
                      </div>
                      {sf > 0 ? (
                        <div className="mt-0.5 text-[11px] text-[#717171]">
                          Est. payout {formatMoney(estPayout, r.currency)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top print:hidden">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-[#dddddd] px-3 text-xs font-semibold text-[#222222]"
                          asChild
                        >
                          <Link href={`/admin/bookings/${r.code}`}>Details</Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-[#222222]"
                              aria-label="More actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/bookings/${r.code}`}>View details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(ev) => {
                                ev.preventDefault();
                                void (async () => {
                                  try {
                                    const cid = await ensureBookingConversation(r.id);
                                    router.push(`/admin/inbox/${cid}`);
                                  } catch (e) {
                                    toast.error(
                                      e instanceof ApiError ? e.message : "Could not open messages",
                                    );
                                  }
                                })();
                              }}
                            >
                              Message guest
                            </DropdownMenuItem>
                            {listingHref ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={listingHref} target="_blank" rel="noreferrer">
                                    Open listing
                                  </Link>
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
