import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Burns up to `requestedCents` of a guest's active credit grants for a given
 * booking, oldest-first by expiry. Inserts credit_redemptions ledger rows and
 * decrements credit_grants.remaining_cents. Logs a payment_history row.
 *
 * Returns the actual amount redeemed (which may be less than requested if the
 * guest has insufficient balance).
 */
export async function redeemCreditsForBooking(input: {
  guestId: string;
  bookingId: string;
  requestedCents: number;
  currency: string;
}): Promise<number> {
  if (input.requestedCents <= 0) return 0;

  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("redeem_booking_credits", {
    p_guest_id: input.guestId,
    p_booking_id: input.bookingId,
    p_requested_cents: input.requestedCents,
    p_currency: input.currency,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Re-credits a guest from previously-redeemed grants on a booking (reverse of
 * redeemCreditsForBooking). Only refills original grants that are still
 * active (not expired). Returns the amount that could not be re-credited (the
 * caller may want to manually issue replacement credit via admin tooling).
 */
export async function refundCreditsForBooking(input: {
  bookingId: string;
  amountCents: number;
}): Promise<{ refunded: number; unrefunded: number }> {
  if (input.amountCents <= 0) return { refunded: 0, unrefunded: 0 };
  const admin = createSupabaseAdmin();

  const { data: redemptions } = await admin
    .from("credit_redemptions")
    .select(
      "id, grant_id, amount_cents, credit_grants!inner(expires_at, currency, status, remaining_cents)",
    )
    .eq("booking_id", input.bookingId)
    .order("created_at", { ascending: true });

  let remaining = input.amountCents;
  let refunded = 0;
  const now = new Date();

  for (const r of (redemptions ?? []) as unknown as Array<{
    id: string;
    grant_id: string;
    amount_cents: number;
    credit_grants: {
      expires_at: string | null;
      currency: string;
      status: string;
      remaining_cents: number;
    };
  }>) {
    if (remaining <= 0) break;
    const grant = r.credit_grants;
    if (grant.expires_at && new Date(grant.expires_at) < now) continue;

    const credit = Math.min(remaining, r.amount_cents);
    const newRem = grant.remaining_cents + credit;
    await admin
      .from("credit_grants")
      .update({ remaining_cents: newRem, status: "active" })
      .eq("id", r.grant_id);
    remaining -= credit;
    refunded += credit;
  }

  return { refunded, unrefunded: remaining };
}
