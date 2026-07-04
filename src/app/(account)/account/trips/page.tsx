"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GuestReservationCard } from "@/components/account/guest-reservation-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type GuestBookingWithListing,
} from "@/lib/bookings/display";
import { isCheckoutPassed } from "@/lib/reviews/eligibility";

const TERMINAL_STATUSES = [
  "completed",
  "cancelled_by_guest",
  "cancelled_by_admin",
  "declined",
  "expired",
];
const PAGE_SIZE = 10;

type TripTab = "upcoming" | "past";

type BookingsResponse = {
  bookings: GuestBookingWithListing[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

function isUpcomingTrip(booking: GuestBookingWithListing): boolean {
  if (TERMINAL_STATUSES.includes(booking.status)) return false;
  return !isCheckoutPassed(booking.check_out);
}

function isPastTrip(booking: GuestBookingWithListing): boolean {
  return TERMINAL_STATUSES.includes(booking.status) || isCheckoutPassed(booking.check_out);
}

function sortUpcomingTrips(items: GuestBookingWithListing[]) {
  return [...items].sort((a, b) => a.check_in.localeCompare(b.check_in));
}

function tripUpdatedAt(booking: GuestBookingWithListing): string {
  return (
    booking.updated_at ??
    booking.cancelled_at ??
    booking.check_out ??
    booking.created_at
  );
}

function sortPastTrips(items: GuestBookingWithListing[]) {
  return [...items].sort((a, b) =>
    tripUpdatedAt(b).localeCompare(tripUpdatedAt(a)),
  );
}

function TripsReservationList({
  items,
  isPending,
  searchQuery,
}: {
  items: GuestBookingWithListing[];
  isPending: boolean;
  searchQuery?: string;
}) {
  if (isPending) {
    return (
      <div className="grid gap-4">
        <div className="h-36 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-36 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }
  if (items.length === 0) {
    const hasSearch = Boolean(searchQuery?.trim());
    return (
      <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-12 text-center">
        <p className="text-sm text-[#5f6b66]">
          {hasSearch ? (
            "No reservations match your search."
          ) : (
            <>
              Nothing here yet.{" "}
              <Link href="/properties" className="font-semibold text-[#1d6fb8] hover:underline">
                Find a stay
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {items.map((b) => (
        <GuestReservationCard key={b.id} booking={b} />
      ))}
    </div>
  );
}

export default function TripsPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchQuery = deferredSearch.trim();
  const [activeTab, setActiveTab] = useState<TripTab>("upcoming");
  const [page, setPage] = useState(1);

  const { data, isPending } = useQuery({
    queryKey: ["trips", activeTab, page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        view: activeTab,
        page: String(page),
        limit: String(PAGE_SIZE),
        sort: activeTab === "upcoming" ? "check_in" : "updated_at",
        dir: activeTab === "upcoming" ? "asc" : "desc",
      });
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/bookings?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("trips");
      return res.json() as Promise<BookingsResponse>;
    },
    placeholderData: (prev) => prev,
  });

  const visibleRows = useMemo(() => {
    const rows = data?.bookings ?? [];
    const tabRows =
      activeTab === "upcoming" ? rows.filter(isUpcomingTrip) : rows.filter(isPastTrip);
    return activeTab === "upcoming"
      ? sortUpcomingTrips(tabRows)
      : sortPastTrips(tabRows);
  }, [activeTab, data?.bookings]);
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-8">
      <header className="border-b border-[#eceeec]">
        <h1 className="font-(family-name:--font-lora) text-3xl font-semibold tracking-tight text-[#1e6a82] md:text-4xl">
          My reservations
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          Review upcoming stays and past trips. Confirmation codes and dates are always visible on each reservation.
        </p>
        <div className="relative mt-5 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by property, code, or location"
            aria-label="Search reservations"
            className="h-10 rounded-full border-[#dce5e0] bg-[#fafcfb] pl-9 text-sm"
          />
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as TripTab);
          setPage(1);
        }}
        className="space-y-6"
      >
        <TabsList className="h-auto gap-1 rounded-full bg-[#e8f4fb] p-1">
          <TabsTrigger
            value="upcoming"
            className="rounded-full px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#1e6a82] data-[state=active]:shadow-sm"
          >
            Upcoming
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="rounded-full px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#1e6a82] data-[state=active]:shadow-sm"
          >
            Past &amp; cancelled
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-0 space-y-4 outline-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">
              Upcoming reservations
              {!isPending ? (
                <span className="ml-2 font-mono text-[11px] font-semibold normal-case tracking-normal text-[#9ca3af]">
                  ({data?.total ?? 0})
                </span>
              ) : null}
            </p>
          </div>
          <TripsReservationList
            items={visibleRows}
            isPending={isPending}
            searchQuery={search}
          />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[#6b7280]">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isPending}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isPending}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="past" className="mt-0 space-y-4 outline-none">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">
            Past reservations
            {!isPending ? (
              <span className="ml-2 font-mono text-[11px] font-semibold normal-case tracking-normal text-[#9ca3af]">
                ({data?.total ?? 0})
              </span>
            ) : null}
          </p>
          <TripsReservationList
            items={visibleRows}
            isPending={isPending}
            searchQuery={search}
          />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[#6b7280]">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isPending}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isPending}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
