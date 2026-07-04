"use client";

import { useQuery } from "@tanstack/react-query";
import {
  paymentHistoryDisplayCents,
  paymentHistoryKindLabel,
  type PaymentHistoryEntry,
} from "@/lib/bookings/payment-history-display";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BookingPaymentHistory({
  bookingId,
  className,
}: {
  bookingId: string;
  className?: string;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ["booking-payments", bookingId],
    queryFn: async () => {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/payment-history`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("payments");
      const j = (await res.json()) as { entries: PaymentHistoryEntry[] };
      return j.entries;
    },
  });

  if (isPending) {
    return (
      <div className={cn("animate-pulse space-y-2", className)}>
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <p className={cn("text-sm text-[#6b7280]", className)}>
        Could not load payment history.
      </p>
    );
  }

  const entries = data ?? [];
  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-[#6b7280]", className)}>
        No payment transactions recorded for this reservation.
      </p>
    );
  }

  return (
    <ul className={cn("divide-y divide-[#eceeec]", className)}>
      {entries.map((entry) => {
        const amount = paymentHistoryDisplayCents(entry);
        const isRefund = entry.kind === "refund" || entry.kind === "credit_refund";
        const isReduction =
          entry.kind === "credit_redemption" || entry.kind === "promo_discount";

        return (
          <li
            key={entry.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-medium text-[#1f2937]">
                {paymentHistoryKindLabel(entry.kind)}
              </p>
              <p className="mt-0.5 text-xs text-[#9ca3af]">
                {formatDate(entry.created_at, "en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 tabular-nums text-sm font-semibold",
                isRefund
                  ? "text-emerald-700"
                  : isReduction
                    ? "text-emerald-800"
                    : "text-[#1f2937]",
              )}
            >
              {isRefund ? "+" : isReduction ? "−" : ""}
              {formatMoney(amount, entry.currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
