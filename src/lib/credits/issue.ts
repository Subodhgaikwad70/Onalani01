import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { creditBatchExpiresAt, guestFavorCreditCents } from "@/lib/credits/units";

export type CreditGrantSource =
  | "admin_grant"
  | "cancellation"
  | "recovery"
  | "referral"
  | "transfer"
  | "promo";

const SYSTEM_LOT_PREFIX = "System issuance — ";

async function getSystemLot(currency: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("credit_lots")
    .select("id, remaining_cents, currency")
    .eq("name", `${SYSTEM_LOT_PREFIX}${currency}`)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`No system credit lot for currency ${currency}`);
  }
  return data;
}

export async function appendCreditLedger(input: {
  guestId: string;
  grantId?: string | null;
  kind:
    | "issued"
    | "redeemed"
    | "refunded"
    | "transferred_out"
    | "transferred_in"
    | "expired";
  amountCents: number;
  currency: string;
  bookingId?: string | null;
  transferId?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from("credit_ledger").insert({
    guest_id: input.guestId,
    grant_id: input.grantId ?? null,
    kind: input.kind,
    amount_cents: input.amountCents,
    currency: input.currency,
    booking_id: input.bookingId ?? null,
    transfer_id: input.transferId ?? null,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
  });
}

/**
 * Issues a new credit batch to a guest. Amount is rounded to whole credits
 * (guest-favor). Default expiry is 12 months from issue.
 */
export async function issueCreditGrant(input: {
  guestId: string;
  amountCents: number;
  currency: string;
  source: CreditGrantSource;
  lotId?: string;
  sourceBookingId?: string | null;
  parentGrantId?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  notifyGuest?: boolean;
  /** When false, reassigns an existing lot balance (e.g. guest transfer). */
  deductFromLot?: boolean;
  /** When false, caller writes ledger rows (e.g. transfer in/out). */
  writeLedger?: boolean;
}): Promise<{ grantId: string; amountCents: number }> {
  const amountCents = guestFavorCreditCents(input.amountCents);
  if (amountCents <= 0) {
    return { grantId: "", amountCents: 0 };
  }

  const admin = createSupabaseAdmin();
  const lot =
    input.lotId != null
      ? (
          await admin
            .from("credit_lots")
            .select("id, remaining_cents, currency")
            .eq("id", input.lotId)
            .single()
        ).data
      : await getSystemLot(input.currency);

  if (!lot) throw new Error("Credit lot not found");
  const deductFromLot = input.deductFromLot !== false;
  if (deductFromLot && (lot.remaining_cents as number) < amountCents) {
    throw new Error("Insufficient funds in credit lot");
  }

  const expiresAt = input.expiresAt ?? creditBatchExpiresAt();

  const { data: grantId, error: grantError } = await admin.rpc(
    "issue_credit_grant_atomic",
    {
      p_lot_id: lot.id as string,
      p_guest_id: input.guestId,
      p_amount_cents: amountCents,
      p_currency: input.currency,
      p_source: input.source,
      p_source_booking_id: input.sourceBookingId ?? null,
      p_parent_grant_id: input.parentGrantId ?? null,
      p_expires_at: expiresAt,
      p_notes: input.notes ?? null,
      p_deduct_from_lot: deductFromLot,
    },
  );
  if (grantError) throw grantError;
  if (!grantId) throw new Error("Credit grant was not created");

  if (input.writeLedger !== false) {
    await appendCreditLedger({
      guestId: input.guestId,
      grantId,
      kind: "issued",
      amountCents,
      currency: input.currency,
      bookingId: input.sourceBookingId ?? null,
      description: ledgerDescriptionForSource(input.source),
      metadata: { source: input.source },
    });
  }

  if (input.notifyGuest !== false) {
    const credits = amountCents / 100;
    await notify({
      recipientId: input.guestId,
      kind: "credit_assigned",
      title: "Travel credits added to your account",
      body: `${credits} ${input.currency} credit${credits === 1 ? "" : "s"} (expires ${new Date(expiresAt).toLocaleDateString()}).`,
      link: "/account/credits",
      email: {
        subject: "Onalani travel credits",
        html: `<p>${credits} ${input.currency} in travel credits were added to your Onalani account. They expire on ${new Date(expiresAt).toLocaleDateString()}.</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/credits">View your credits</a></p>`,
      },
    });
  }

  return { grantId: grantId as string, amountCents };
}

function ledgerDescriptionForSource(source: CreditGrantSource): string {
  switch (source) {
    case "cancellation":
      return "Cancellation credit";
    case "recovery":
      return "Recovery credit";
    case "transfer":
      return "Credit transfer received";
    case "referral":
      return "Referral reward";
    case "promo":
      return "Promotional credit";
    default:
      return "Credit issued";
  }
}

/** Issue cancellation credits instead of a cash Stripe refund (guest cancellations). */
export async function issueCancellationCredits(input: {
  guestId: string;
  bookingId: string;
  amountCents: number;
  currency: string;
}): Promise<number> {
  const { amountCents } = await issueCreditGrant({
    guestId: input.guestId,
    amountCents: input.amountCents,
    currency: input.currency,
    source: "cancellation",
    sourceBookingId: input.bookingId,
    notes: `Cancellation credit for booking ${input.bookingId}`,
  });
  return amountCents;
}
