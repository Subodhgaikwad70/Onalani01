import type { SupabaseClient } from "@supabase/supabase-js";
import { syncBeds24BookingFinancialFromPayments } from "@/lib/beds24/sync-booking-financial";

/** Mark a pending supplemental charge row as paid after Stripe succeeds. */
export async function markSupplementalChargePaid(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    guestId: string;
    stripeObjectId: string;
    amountCents: number;
    currency: string;
  },
): Promise<void> {
  const { data: rows } = await admin
    .from("payment_history")
    .select("id, metadata")
    .eq("booking_id", input.bookingId)
    .eq("kind", "charge")
    .eq("stripe_object_id", input.stripeObjectId);

  if (rows && rows.length > 0) {
    for (const row of rows) {
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      await admin
        .from("payment_history")
        .update({
          metadata: { ...meta, status: "succeeded" },
        })
        .eq("id", row.id);
    }
  } else {
    const { data: pendingRows } = await admin
      .from("payment_history")
      .select("id, metadata")
      .eq("booking_id", input.bookingId)
      .eq("kind", "charge")
      .contains("metadata", { status: "pending", supplemental: true });

    if (pendingRows && pendingRows.length === 1) {
      const row = pendingRows[0]!;
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      await admin
        .from("payment_history")
        .update({
          stripe_object_id: input.stripeObjectId,
          metadata: { ...meta, status: "succeeded" },
        })
        .eq("id", row.id);
    } else {
      await admin.from("payment_history").insert({
        booking_id: input.bookingId,
        guest_id: input.guestId,
        kind: "charge",
        amount_cents: input.amountCents,
        currency: input.currency,
        stripe_object_id: input.stripeObjectId,
        metadata: { supplemental: true, status: "succeeded" },
      });
    }
  }

  try {
    await syncBeds24BookingFinancialFromPayments(admin, input.bookingId);
  } catch (e) {
    console.error("[supplemental-payment] Beds24 invoice sync failed", e);
  }
}
