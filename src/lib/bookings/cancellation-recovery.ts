import type { SupabaseClient } from "@supabase/supabase-js";
import { issueCreditGrant } from "@/lib/credits/issue";

export type RecoveryEntitlementRow = {
  id: string;
  source_booking_id: string;
  guest_id: string;
  listing_id: string;
  check_in: string;
  check_out: string;
  currency: string;
  max_recovery_cents: number;
  fulfilled_cents: number;
  status: string;
};

/** Record pending recovery credits when a guest cancels. */
export async function createRecoveryEntitlement(
  admin: SupabaseClient,
  input: {
    sourceBookingId: string;
    guestId: string;
    listingId: string;
    checkIn: string;
    checkOut: string;
    currency: string;
    maxRecoveryCents: number;
  },
): Promise<void> {
  if (input.maxRecoveryCents <= 0) return;

  await admin.from("cancellation_recovery_entitlements").insert({
    source_booking_id: input.sourceBookingId,
    guest_id: input.guestId,
    listing_id: input.listingId,
    check_in: input.checkIn,
    check_out: input.checkOut,
    currency: input.currency,
    max_recovery_cents: input.maxRecoveryCents,
    fulfilled_cents: 0,
    status: "pending",
  });
}

function datesOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string,
): boolean {
  return aIn < bOut && bIn < aOut;
}

/**
 * When a new booking is confirmed, issue recovery credits to guests whose
 * cancelled dates overlap and still have pending entitlements.
 */
export async function fulfillRecoveryCreditsForBooking(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    listingId: string;
    checkIn: string;
    checkOut: string;
    subtotalCents: number;
    currency: string;
  },
): Promise<void> {
  const { data: entitlements, error } = await admin
    .from("cancellation_recovery_entitlements")
    .select("*")
    .eq("listing_id", input.listingId)
    .eq("status", "pending");

  if (error || !entitlements?.length) return;

  for (const row of entitlements as RecoveryEntitlementRow[]) {
    if (!datesOverlap(row.check_in, row.check_out, input.checkIn, input.checkOut)) {
      continue;
    }

    const remaining = row.max_recovery_cents - row.fulfilled_cents;
    if (remaining <= 0) continue;

    // Recovery = min(remaining entitlement, half of new booking subtotal)
    const recoveryAmount = Math.min(
      remaining,
      Math.round(input.subtotalCents * 0.5),
    );
    if (recoveryAmount <= 0) continue;

    const issued = await issueCreditGrant({
      guestId: row.guest_id,
      amountCents: recoveryAmount,
      currency: input.currency,
      source: "recovery",
      sourceBookingId: row.source_booking_id,
      notes: `Recovery credit — dates rebooked (booking ${input.bookingId})`,
    });

    if (issued.amountCents <= 0) continue;

    const newFulfilled = row.fulfilled_cents + issued.amountCents;
    const newStatus =
      newFulfilled >= row.max_recovery_cents ? "fulfilled" : "pending";

    await admin
      .from("cancellation_recovery_entitlements")
      .update({
        fulfilled_cents: newFulfilled,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await admin.from("payment_history").insert({
      booking_id: row.source_booking_id,
      guest_id: row.guest_id,
      kind: "credit_refund",
      amount_cents: -issued.amountCents,
      currency: input.currency,
      metadata: {
        recovery: true,
        replacement_booking_id: input.bookingId,
      },
    });
  }
}
