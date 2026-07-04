/** Response shape for GET /api/admin/dashboard */
export type AdminDashboardStats = {
  generated_at: string;
  revenue_30d: Record<string, number>;
  sections: {
    properties: { total: number; active: number };
    listings: { total: number; active: number };
    calendar: { upcoming_stays: number; in_stay: number };
    inbox: { threads: number; unread: number };
    bookings: {
      active: number;
      requested: number;
      by_status: Record<string, number>;
    };
    complaints: { open: number };
    reviews: { total: number; unpublished: number };
    refunds: { count_30d: number };
    credit_lots: { total: number; remaining_by_currency: Record<string, number> };
    credit_grants: { active: number };
    promos: { total: number; active: number };
    amenities: { total: number };
    categories: { total: number };
    tax_rates: { total: number };
    users: { guests: number; staff: number };
    audit: { events_7d: number };
  };
};

export function sumBookingStatuses(byStatus: Record<string, number>): number {
  return Object.values(byStatus).reduce((a, b) => a + b, 0);
}
