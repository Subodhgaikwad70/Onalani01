import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

type Params = { id: string };

const GUEST_VISIBLE_KINDS = new Set([
  "charge",
  "refund",
  "credit_redemption",
  "credit_refund",
  "promo_discount",
]);

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

/** GET /api/bookings/{id}/payment-history — ledger entries for a reservation. */
export const GET = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = boundedInt(url.searchParams.get("limit"), 50, 100);
  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, guest_id")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (bookingError) return jsonError(500, bookingError.message);
  if (!booking) return jsonError(404, "Booking not found");

  const isStaff = isAdminRole(session.role);
  if (!isStaff && booking.guest_id !== session.user.id) {
    return jsonError(403, "Forbidden");
  }

  const { data, error } = await admin
    .from("payment_history")
    .select("id, kind, amount_cents, currency, stripe_object_id, metadata, created_at")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return jsonError(500, error.message);

  const entries = (data ?? []).filter((row) =>
    isStaff ? true : GUEST_VISIBLE_KINDS.has(row.kind as string),
  );

  return Response.json({ entries });
});
