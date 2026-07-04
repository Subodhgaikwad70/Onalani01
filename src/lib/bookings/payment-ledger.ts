import type { SupabaseClient } from "@supabase/supabase-js";

/** Net cash collected via Stripe (charges minus refunds) for a booking. */
export async function getBookingCashPaidCents(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("payment_history")
    .select("kind, amount_cents")
    .eq("booking_id", bookingId)
    .in("kind", ["charge", "refund"]);
  if (error) throw new Error(error.message);

  let net = 0;
  for (const row of data ?? []) {
    net += Number(row.amount_cents ?? 0);
  }
  return Math.max(0, net);
}

export type BookingChargeRow = {
  stripe_object_id: string;
  amount_cents: number;
  metadata: Record<string, unknown> | null;
};

export type BookingPaidChargeRow = BookingChargeRow & {
  created_at: string;
};

/** Succeeded Stripe charge rows for invoice sync (excludes pending supplemental intents). */
export async function getBookingPaidChargeRows(
  admin: SupabaseClient,
  bookingId: string,
): Promise<BookingPaidChargeRow[]> {
  const { data, error } = await admin
    .from("payment_history")
    .select("stripe_object_id, amount_cents, created_at, metadata")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .not("stripe_object_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return meta?.status !== "pending";
    })
    .map((row) => ({
      stripe_object_id: String(row.stripe_object_id),
      amount_cents: Number(row.amount_cents ?? 0),
      created_at: String(row.created_at),
      metadata: row.metadata as Record<string, unknown> | null,
    }))
    .filter((row) => row.amount_cents > 0);
}

/** Stripe charge rows still refundable (excludes pending supplemental intents). */
export async function getBookingStripeCharges(
  admin: SupabaseClient,
  bookingId: string,
): Promise<BookingChargeRow[]> {
  const { data, error } = await admin
    .from("payment_history")
    .select("stripe_object_id, amount_cents, metadata")
    .eq("booking_id", bookingId)
    .eq("kind", "charge")
    .not("stripe_object_id", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return meta?.status !== "pending";
    })
    .map((row) => ({
      stripe_object_id: String(row.stripe_object_id),
      amount_cents: Number(row.amount_cents ?? 0),
      metadata: row.metadata as Record<string, unknown> | null,
    }))
    .filter((row) => row.amount_cents > 0);
}
