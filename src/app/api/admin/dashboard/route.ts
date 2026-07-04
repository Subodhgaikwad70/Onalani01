import { requireAdmin } from "@/lib/auth/guards";
import type { AdminDashboardStats } from "@/lib/admin-dashboard";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const MS_7D = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = [
  "confirmed",
  "in_stay",
  "pending_payment",
  "requested",
] as const;
const DASHBOARD_BOOKING_STATUSES = [
  "pending_payment",
  "requested",
  "confirmed",
  "in_stay",
  "completed",
  "cancelled_by_guest",
  "cancelled_by_admin",
  "expired",
  "declined",
] as const;

function isoDaysAgo(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/dashboard — summaries for every admin console area.
 */
export const GET = requireAdmin(async () => {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const since30d = isoDaysAgo(MS_30D);
  const since7d = isoDaysAgo(MS_7D);
  const today = todayUtcDate();
  const weekAhead = addDaysToDate(today, 7);

  const [
    propertiesTotalRes,
    activePropertiesRes,
    listingsTotalRes,
    activeListingsRes,
    ...bookingStatusRes
  ] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("listings").select("id", { count: "exact", head: true }),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    ...DASHBOARD_BOOKING_STATUSES.map((status) =>
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  ]);

  const [
    upcomingRes,
    inStayRes,
    conversationsRes,
    unreadRes,
    complaintsRes,
    listingReviewsRes,
    unpublishedReviewsRes,
    paymentsRes,
    refundsRes,
    creditLotsRes,
    creditGrantsRes,
    promosRes,
    activePromosRes,
    amenitiesRes,
    categoriesRes,
    taxRatesRes,
    guestUsersRes,
    staffUsersRes,
    auditRes,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIVE_BOOKING_STATUSES])
      .lte("check_in", weekAhead)
      .gte("check_out", today),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_stay"),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase
      .from("conversations")
      .select("admin_unread_count")
      .gt("admin_unread_count", 0),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "investigating"]),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("subject_type", "listing"),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("subject_type", "listing")
      .eq("is_published", false),
    supabase
      .from("payment_history")
      .select("amount_cents, currency, kind")
      .gte("created_at", since30d),
    supabase
      .from("payment_history")
      .select("id", { count: "exact", head: true })
      .eq("kind", "refund")
      .gte("created_at", since30d),
    supabase.from("credit_lots").select("remaining_cents, currency"),
    supabase
      .from("credit_grants")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("promo_codes").select("id", { count: "exact", head: true }),
    supabase
      .from("promo_codes")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("amenities").select("id", { count: "exact", head: true }),
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("tax_rates").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "guest"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "super_admin"]),
    admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
  ]);

  const firstError =
    propertiesTotalRes.error ??
    activePropertiesRes.error ??
    listingsTotalRes.error ??
    activeListingsRes.error ??
    bookingStatusRes.find((res) => res.error)?.error ??
    complaintsRes.error ??
    paymentsRes.error;
  if (firstError) return jsonError(500, firstError.message);

  const bookingsByStatus: Record<string, number> = {};
  for (const [index, status] of DASHBOARD_BOOKING_STATUSES.entries()) {
    const count = bookingStatusRes[index]?.count ?? 0;
    if (count > 0) bookingsByStatus[status] = count;
  }
  const activeBookings = ACTIVE_BOOKING_STATUSES.reduce(
    (sum, status) => sum + (bookingsByStatus[status] ?? 0),
    0,
  );
  const requestedBookings = bookingsByStatus.requested ?? 0;

  const revenue30d: Record<string, number> = {};
  for (const p of paymentsRes.data ?? []) {
    if (p.kind !== "charge") continue;
    const cur = p.currency as string;
    revenue30d[cur] = (revenue30d[cur] ?? 0) + (p.amount_cents as number);
  }

  const creditLots = creditLotsRes.data ?? [];
  const remainingByCurrency: Record<string, number> = {};
  for (const lot of creditLots) {
    const cur = lot.currency as string;
    remainingByCurrency[cur] =
      (remainingByCurrency[cur] ?? 0) + (lot.remaining_cents as number);
  }

  const unread =
    unreadRes.data?.reduce(
      (sum, row) => sum + ((row.admin_unread_count as number) ?? 0),
      0,
    ) ?? 0;

  const body: AdminDashboardStats = {
    generated_at: new Date().toISOString(),
    revenue_30d: revenue30d,
    sections: {
      properties: {
        total: propertiesTotalRes.count ?? 0,
        active: activePropertiesRes.count ?? 0,
      },
      listings: {
        total: listingsTotalRes.count ?? 0,
        active: activeListingsRes.count ?? 0,
      },
      calendar: {
        upcoming_stays: upcomingRes.count ?? 0,
        in_stay: inStayRes.count ?? 0,
      },
      inbox: {
        threads: conversationsRes.count ?? 0,
        unread,
      },
      bookings: {
        active: activeBookings,
        requested: requestedBookings,
        by_status: bookingsByStatus,
      },
      complaints: { open: complaintsRes.count ?? 0 },
      reviews: {
        total: listingReviewsRes.count ?? 0,
        unpublished: unpublishedReviewsRes.count ?? 0,
      },
      refunds: { count_30d: refundsRes.count ?? 0 },
      credit_lots: {
        total: creditLots.length,
        remaining_by_currency: remainingByCurrency,
      },
      credit_grants: { active: creditGrantsRes.count ?? 0 },
      promos: {
        total: promosRes.count ?? 0,
        active: activePromosRes.count ?? 0,
      },
      amenities: { total: amenitiesRes.count ?? 0 },
      categories: { total: categoriesRes.count ?? 0 },
      tax_rates: { total: taxRatesRes.count ?? 0 },
      users: {
        guests: guestUsersRes.count ?? 0,
        staff: staffUsersRes.count ?? 0,
      },
      audit: { events_7d: auditRes.count ?? 0 },
    },
  };

  return Response.json(body);
});
