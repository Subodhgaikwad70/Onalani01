"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  Building2,
  Calendar,
  FileSearch,
  Flag,
  FolderTree,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  Star,
  Tag,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminDashboardStats } from "@/lib/admin-dashboard";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type SectionCard = {
  href: string;
  label: string;
  icon: LucideIcon;
  summary: string;
  detail?: string;
  highlight?: boolean;
};

function formatRevenue(revenue: Record<string, number>): string {
  const entries = Object.entries(revenue).filter(([, cents]) => cents > 0);
  if (entries.length === 0) return formatMoney(0, "USD");
  return entries.map(([cur, cents]) => formatMoney(cents, cur)).join(" · ");
}

function creditRemainingSummary(remaining: Record<string, number>): string {
  const entries = Object.entries(remaining).filter(([, cents]) => cents > 0);
  if (entries.length === 0) return "No balance remaining";
  return entries.map(([cur, cents]) => formatMoney(cents, cur)).join(" · ");
}

function buildCards(stats: AdminDashboardStats): SectionCard[] {
  const s = stats.sections;
  const { requested } = s.bookings;

  return [
    {
      href: "/admin/properties",
      label: "Properties",
      icon: Building2,
      summary: `${s.properties.active} active`,
      detail: `${s.properties.total} properties · ${s.listings.active}/${s.listings.total} listings live`,
    },
    {
      href: "/admin/calendar",
      label: "Calendar",
      icon: Calendar,
      summary: `${s.calendar.upcoming_stays} upcoming`,
      detail:
        s.calendar.in_stay > 0
          ? `${s.calendar.in_stay} guest${s.calendar.in_stay === 1 ? "" : "s"} in stay`
          : "Month view · blocks · overrides",
    },
    {
      href: "/admin/inbox",
      label: "Inbox",
      icon: MessageSquare,
      summary:
        s.inbox.unread > 0
          ? `${s.inbox.unread} unread`
          : `${s.inbox.threads} threads`,
      detail: `${s.inbox.threads} conversations`,
      highlight: s.inbox.unread > 0,
    },
    {
      href: "/admin/bookings",
      label: "Bookings",
      icon: Receipt,
      summary: `${s.bookings.active} active`,
      detail:
        requested > 0
          ? `${requested} awaiting approval`
          : Object.keys(s.bookings.by_status).length
            ? `${Object.values(s.bookings.by_status).reduce((a, b) => a + b, 0)} all-time`
            : "Reservations & payouts",
      highlight: requested > 0,
    },
    {
      href: "/admin/complaints",
      label: "Complaints",
      icon: Flag,
      summary:
        s.complaints.open > 0
          ? `${s.complaints.open} open`
          : "None open",
      detail: "Guest & booking issues",
      highlight: s.complaints.open > 0,
    },
    {
      href: "/admin/reviews",
      label: "Reviews",
      icon: Star,
      summary: `${s.reviews.total} listing review${s.reviews.total === 1 ? "" : "s"}`,
      detail:
        s.reviews.unpublished > 0
          ? `${s.reviews.unpublished} awaiting publish`
          : "Guest feedback on stays",
      highlight: s.reviews.unpublished > 0,
    },
    {
      href: "/admin/refunds",
      label: "Refunds",
      icon: RotateCcw,
      summary: `${s.refunds.count_30d} in 30 days`,
      detail: "Issue partial or full refunds",
    },
    {
      href: "/admin/credits/lots",
      label: "Credit lots",
      icon: Package,
      summary: `${s.credit_lots.total} lots`,
      detail: creditRemainingSummary(s.credit_lots.remaining_by_currency),
    },
    {
      href: "/admin/credits/grants",
      label: "Credit grants",
      icon: Gift,
      summary: `${s.credit_grants.active} active`,
      detail: "Per-guest credit balances",
    },
    {
      href: "/admin/promos",
      label: "Promos",
      icon: Tag,
      summary: `${s.promos.active} active codes`,
      detail: `${s.promos.total} total promos`,
    },
    {
      href: "/admin/amenities",
      label: "Amenities",
      icon: Armchair,
      summary: `${s.amenities.total} amenities`,
      detail: "Listing amenity catalog",
    },
    {
      href: "/admin/categories",
      label: "Categories",
      icon: FolderTree,
      summary: `${s.categories.total} categories`,
      detail: "Browse & search taxonomy",
    },
    {
      href: "/admin/tax-rates",
      label: "Tax rates",
      icon: Receipt,
      summary: `${s.tax_rates.total} jurisdictions`,
      detail: "Lodging tax configuration",
    },
    {
      href: "/admin/users",
      label: "Users",
      icon: Users,
      summary: `${s.users.guests} guests`,
      detail: `${s.users.staff} admin${s.users.staff === 1 ? "" : "s"}`,
    },
    {
      href: "/admin/settings",
      label: "Settings",
      icon: Settings,
      summary: "Platform config",
      detail: "Policies, integrations & ops",
    },
    {
      href: "/admin/audit",
      label: "Audit log",
      icon: FileSearch,
      summary: `${s.audit.events_7d} events (7d)`,
      detail: "Staff actions & changes",
    },
  ];
}

export function AdminDashboardClient() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("dashboard");
      return res.json() as Promise<AdminDashboardStats>;
    },
  });

  const cards = data ? buildCards(data) : [];
  const listings = data?.sections.listings;

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-2xl bg-[#1e3a34] text-white shadow-md">
        <div className="p-6 md:flex md:items-end md:justify-between md:p-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              Admin console
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-lora)] text-3xl font-semibold md:text-4xl">
              Dashboard
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
              Overview of properties, bookings, messaging, credits, and catalog tools. Open any
              section for full management.
            </p>
          </div>
          <div className="mt-6 grid w-full gap-3 sm:grid-cols-2 md:mt-0 md:max-w-md">
            <OverviewStat
              label="Revenue (30 days)"
              loading={isPending}
              value={data ? formatRevenue(data.revenue_30d) : "—"}
            />
            <OverviewStat
              label="Active listings"
              loading={isPending}
              value={
                listings
                  ? `${listings.active} / ${listings.total}`
                  : "—"
              }
              sub={
                data && data.sections.bookings.requested > 0
                  ? `${data.sections.bookings.requested} booking requests pending`
                  : undefined
              }
            />
          </div>
        </div>
      </header>

      {isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load dashboard.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}

      <section>
        <div className="mb-4 flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            All admin areas
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isPending
            ? Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="h-[132px] rounded-xl" />
              ))
            : cards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={cn(
                    "group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:border-[#1e3a34]/30 hover:shadow-md",
                    card.highlight && "border-amber-300/80 bg-amber-50/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a34]/8 text-[#1e3a34]">
                      <card.icon className="h-4 w-4" />
                    </span>
                    <span
                      className="text-xs font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100"
                      aria-hidden
                    >
                      Open →
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{card.label}</h3>
                  <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-[#1e3a34]">
                    {card.summary}
                  </p>
                  {card.detail ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {card.detail}
                    </p>
                  ) : null}
                </Link>
              ))}
        </div>
      </section>

      {data && Object.keys(data.sections.bookings.by_status).length > 0 ? (
        <section className="rounded-xl border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold text-foreground">Bookings by status</h2>
          <dl className="mt-3 flex flex-wrap gap-3">
            {Object.entries(data.sections.bookings.by_status)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => (
                <div
                  key={status}
                  className="min-w-[7rem] rounded-lg border bg-card px-3 py-2 text-center"
                >
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {status.replaceAll("_", " ")}
                  </dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function OverviewStat({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-28 bg-white/20" />
      ) : (
        <p className="mt-2 text-lg font-semibold tabular-nums leading-snug">{value}</p>
      )}
      {sub ? <p className="mt-1 text-xs text-white/70">{sub}</p> : null}
    </div>
  );
}
