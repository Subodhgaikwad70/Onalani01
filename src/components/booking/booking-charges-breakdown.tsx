import type { PricingBreakdown } from "@/lib/bookings/pricing";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BookingChargesBreakdown({
  breakdown,
  currency,
  totalCents,
  creditAppliedCents = 0,
  promoDiscountCents = 0,
  totalLabel = "Total",
  className,
}: {
  breakdown: PricingBreakdown | null;
  currency: string;
  totalCents: number;
  creditAppliedCents?: number | null;
  promoDiscountCents?: number | null;
  totalLabel?: string;
  className?: string;
}) {
  const credits = Math.max(0, creditAppliedCents ?? 0);
  const promo = Math.max(0, promoDiscountCents ?? 0);

  if (!breakdown) {
    return (
      <p className={cn("text-sm text-[#6b7280]", className)}>
        Charge details are not available for this booking.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      {breakdown.nights > 0 ? (
        <div className="flex justify-between gap-4">
          <span className="text-[#5f6b66]">
            {breakdown.nights} night{breakdown.nights === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums text-[#1f2937]">
            {formatMoney(breakdown.subtotal_cents, currency)}
          </span>
        </div>
      ) : null}

      {breakdown.length_of_stay_discount_cents > 0 ? (
        <div className="flex justify-between gap-4 text-emerald-700">
          <span className="text-[#5f6b66]">Length-of-stay discount</span>
          <span className="tabular-nums">
            −{formatMoney(breakdown.length_of_stay_discount_cents, currency)}
          </span>
        </div>
      ) : null}

      {breakdown.fees.map((f) => (
        <div key={`${f.kind}-${f.label}`} className="flex justify-between gap-4">
          <span className="text-[#5f6b66]">{f.label}</span>
          <span className="tabular-nums text-[#1f2937]">
            {formatMoney(f.amount_cents, currency)}
          </span>
        </div>
      ))}

      {breakdown.taxes.length > 0 ? (
        <>
          <div className="my-3 border-t border-[#eceeec]" />
          {breakdown.taxes.map((t, i) => (
            <div
              key={`${t.jurisdiction}-${t.kind}-${i}`}
              className="flex justify-between gap-4"
            >
              <span className="text-[#5f6b66]">
                Tax · {t.jurisdiction} ({t.kind})
              </span>
              <span className="tabular-nums text-[#1f2937]">
                {formatMoney(t.amount_cents, currency)}
              </span>
            </div>
          ))}
        </>
      ) : null}

      {promo > 0 ? (
        <div className="flex justify-between gap-4 pt-2 text-emerald-700">
          <span className="text-[#5f6b66]">Promo discount</span>
          <span className="tabular-nums">−{formatMoney(promo, currency)}</span>
        </div>
      ) : null}

      {credits > 0 ? (
        <div className="flex justify-between gap-4 pt-2">
          <span className="text-[#5f6b66]">Credits applied</span>
          <span className="tabular-nums text-emerald-700">
            −{formatMoney(credits, currency)}
          </span>
        </div>
      ) : null}

      <div className="my-4 border-t border-[#dfe6e1]" />
      <div className="flex justify-between gap-4 text-base font-semibold text-[#1e6a82]">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
      </div>
    </div>
  );
}
