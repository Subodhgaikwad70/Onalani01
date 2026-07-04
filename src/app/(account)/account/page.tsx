"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GuestReservationCard } from "@/components/account/guest-reservation-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSupabaseSession } from "@/lib/supabase/session-context";
import type { GuestBookingWithListing } from "@/lib/bookings/display";
import { formatMoney } from "@/lib/format";

const UPCOMING = ["confirmed", "pending_payment", "requested", "in_stay"];

type BookingsResponse = {
  bookings: GuestBookingWithListing[];
  total: number;
};

export default function AccountDashboardPage() {
  const { user } = useSupabaseSession();

  const { data: profileRow } = useQuery({
    queryKey: ["account-profile-snippet", user?.id],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data as { display_name: string } | null;
    },
    enabled: Boolean(user?.id),
  });

  const welcomeFirst =
    profileRow?.display_name?.trim().split(/\s+/)[0] ??
    user?.email?.split("@")[0] ??
    "";

  const { data: bookings, isPending: bookingsPending } = useQuery({
    queryKey: ["my-bookings-dash"],
    queryFn: async () => {
      const params = new URLSearchParams({
        view: "upcoming",
        page: "1",
        limit: "3",
        sort: "check_in",
        dir: "asc",
      });
      const res = await fetch(`/api/bookings?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("bookings");
      return res.json() as Promise<BookingsResponse>;
    },
  });

  const { data: credits, isPending: creditsPending } = useQuery({
    queryKey: ["credits-dash"],
    queryFn: async () => {
      const res = await fetch("/api/guests/me/credits?include=balances", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("credits");
      return res.json() as Promise<{ balances: Record<string, number> }>;
    },
  });

  const rows = bookings?.bookings ?? [];
  const upcoming = rows.filter((b) => UPCOMING.includes(b.status)).slice(0, 3);
  const usd = credits?.balances?.USD ?? 0;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-[#5cbadf] text-white shadow-md">
        <div className="p-6 md:flex md:items-start md:justify-between md:p-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">
              Welcome back
            </p>
            <h1 className="mt-2 font-(family-name:--font-lora) text-3xl font-semibold capitalize md:text-4xl">
              {welcomeFirst}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">
              Manage reservations, credits, and messages in one place. Book direct with transparent pricing—no platform fees on stays you reserve here.
            </p>
            <Link
              href="/account/profile"
              className="mt-5 inline-flex items-center text-sm font-semibold text-[#e8f8ff] underline-offset-4 hover:underline"
            >
              View or edit profile
              <span className="ml-1" aria-hidden>
                ›
              </span>
            </Link>
          </div>
          <div className="mt-6 grid w-full gap-3 sm:grid-cols-2 md:mt-0 md:max-w-md">
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">
                Credit balance
              </p>
              {creditsPending ? (
                <Skeleton className="mt-3 h-8 w-28 bg-white/20" />
              ) : (
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {formatMoney(usd, "USD")}
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="mt-4 border-0 bg-white text-[#1e6a82] hover:bg-white/90"
                asChild
              >
                <Link href="/account/credits">Credits summary</Link>
              </Button>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">
                Trips
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {bookings?.total ?? 0}
              </p>
              <p className="mt-1 text-xs text-white/70">Upcoming reservations</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="/account/trips">View trips</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-[#7dceeb] p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-(family-name:--font-lora) text-xl font-semibold md:text-2xl">
              Find your next stay
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              Search destinations and listings, then book directly with the host.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="border-0 bg-white text-[#1e6a82] hover:bg-white/90">
              <Link href="/properties">Search</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
              Upcoming
            </p>
            <h2 className="font-(family-name:--font-lora) text-xl font-semibold text-[#1f2937] md:text-2xl">
              Your reservations
            </h2>
          </div>
          <Link
            href="/account/trips"
            className="text-sm font-semibold text-[#1d6fb8] hover:underline"
          >
            View all
          </Link>
        </div>

        {bookingsPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-10 text-center">
            <p className="text-sm text-[#5f6b66]">
              No upcoming stays yet.{" "}
              <Link href="/properties" className="font-semibold text-[#1d6fb8] hover:underline">
                Search
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {upcoming.map((b) => (
              <GuestReservationCard key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 border-t border-[#eceeec] pt-8 md:grid-cols-2">
        <div className="rounded-xl border border-[#e2e8e4] bg-[#fafcfb] p-5">
          <h3 className="text-sm font-semibold text-[#1f2937]">Saved &amp; lists</h3>
          <p className="mt-2 text-sm text-[#6b7280]">
            Pick up where you left off with saved searches and wishlists.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/saved-searches">Saved searches</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/wishlists">Wishlists</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-[#e2e8e4] bg-[#fafcfb] p-5">
          <h3 className="text-sm font-semibold text-[#1f2937]">Need help?</h3>
          <p className="mt-2 text-sm text-[#6b7280]">
            Message your host from trips or open a formal complaint if something goes wrong.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/messages">Messages</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/complaints">Complaints</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
