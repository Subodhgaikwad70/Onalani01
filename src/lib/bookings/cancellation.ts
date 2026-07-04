/**
 * Cancellation engine — applies a snapshotted cancellation policy to a
 * booking and returns cash refund, credit refund, and recovery amounts.
 *
 * Policy rules format (public.cancellation_policies.rules jsonb):
 *   {
 *     hours_before: number;
 *     refund_pct?: number;          // legacy — treated as cash_refund_pct
 *     cash_refund_pct?: number;
 *     credit_min_pct?: number;      // guaranteed credits (% of total paid)
 *     credit_max_pct?: number;      // max recovery credits (% of total paid)
 *     recovery_based?: boolean;
 *     processing_fee_pct?: number;  // deducted from full cash refunds
 *   }
 *
 * Rules are evaluated in descending hours_before order; first match wins.
 */

export type CancellationRule = {
  hours_before: number;
  /** @deprecated use cash_refund_pct */
  refund_pct?: number;
  cash_refund_pct?: number;
  credit_min_pct?: number;
  credit_max_pct?: number;
  recovery_based?: boolean;
  processing_fee_pct?: number;
};

export type CancellationOutcome = {
  /** Combined refund percentage for display (cash + guaranteed credits). */
  refund_pct: number;
  cash_refund_cents: number;
  /** Re-credit of credits used at checkout. */
  credit_refund_cents: number;
  /** New travel credits issued immediately (guaranteed minimum). */
  guaranteed_credit_cents: number;
  /** Pending recovery credits if dates rebook (not issued yet). */
  recovery_entitlement_cents: number;
  processing_fee_cents: number;
  total_paid_cash_cents: number;
  total_paid_credit_cents: number;
  total_paid_cents: number;
  rule_matched: CancellationRule | null;
  hours_to_check_in: number;
  days_to_check_in: number;
  recovery_based: boolean;
};

function ruleCashPct(rule: CancellationRule | null): number {
  if (!rule) return 0;
  return rule.cash_refund_pct ?? rule.refund_pct ?? 0;
}

export function computeCancellation(input: {
  rules: CancellationRule[];
  checkIn: Date;
  now?: Date;
  cashPaidCents: number;
  creditPaidCents: number;
}): CancellationOutcome {
  const now = input.now ?? new Date();
  const hoursToCheckIn = Math.max(
    0,
    (input.checkIn.getTime() - now.getTime()) / (1000 * 60 * 60),
  );
  const daysToCheckIn = Math.floor(hoursToCheckIn / 24);

  const sortedRules = [...input.rules].sort(
    (a, b) => b.hours_before - a.hours_before,
  );
  const matched =
    sortedRules.find((r) => hoursToCheckIn >= r.hours_before) ??
    sortedRules[sortedRules.length - 1] ??
    null;

  const totalPaid = input.cashPaidCents + input.creditPaidCents;
  const cashPct = ruleCashPct(matched);
  const creditMinPct = matched?.credit_min_pct ?? 0;
  const creditMaxPct = matched?.credit_max_pct ?? 0;
  const recoveryBased = Boolean(matched?.recovery_based);
  const processingFeePct = matched?.processing_fee_pct ?? 0;

  let cashRefund = Math.round(input.cashPaidCents * (cashPct / 100));
  let processingFee = 0;
  if (cashPct >= 100 && processingFeePct > 0 && cashRefund > 0) {
    processingFee = Math.round(cashRefund * (processingFeePct / 100));
    cashRefund = Math.max(0, cashRefund - processingFee);
  }

  const guaranteedCredit = Math.round(totalPaid * (creditMinPct / 100));

  let recoveryEntitlement = 0;
  if (recoveryBased && creditMaxPct > 0) {
    const maxRecovery = Math.round(totalPaid * (creditMaxPct / 100));
    recoveryEntitlement = Math.max(0, maxRecovery - guaranteedCredit);
  } else if (
    recoveryBased &&
    creditMaxPct === 0 &&
    creditMinPct === 0
  ) {
    // Super Strict under 29 days: up to half the booking as recovery credits.
    recoveryEntitlement = Math.round(totalPaid * 0.5);
  }

  const totalRefundPct = Math.min(
    100,
    cashPct + creditMinPct + (recoveryEntitlement > 0 ? creditMaxPct : 0),
  );

  const creditRefundPct = Math.min(100, cashPct + creditMinPct);
  const creditRefund = Math.round(
    input.creditPaidCents * (creditRefundPct / 100),
  );

  return {
    refund_pct: totalRefundPct,
    cash_refund_cents: cashRefund,
    credit_refund_cents: creditRefund,
    guaranteed_credit_cents: guaranteedCredit,
    recovery_entitlement_cents: recoveryEntitlement,
    processing_fee_cents: processingFee,
    total_paid_cash_cents: input.cashPaidCents,
    total_paid_credit_cents: input.creditPaidCents,
    total_paid_cents: totalPaid,
    rule_matched: matched,
    hours_to_check_in: hoursToCheckIn,
    days_to_check_in: daysToCheckIn,
    recovery_based: recoveryBased,
  };
}
