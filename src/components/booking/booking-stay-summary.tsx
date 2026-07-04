import Link from "next/link";
import type { PricingBreakdown } from "@/lib/bookings/pricing";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BookingListingSummary = {
  slug: string;
  title: string;
  location: string | null;
  imageUrl: string;
};

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=600&q=85";

function formatStayRange(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return "Select dates";
  return `${formatDate(checkIn, "en-US", { month: "short", day: "numeric" })} – ${formatDate(checkOut, "en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function BookingStaySummary({
  listing,
  checkIn,
  checkOut,
  guestLabel,
  quote,
  promoDiscount,
  creditApplied = 0,
  totalDue,
  loading,
  className,
}: {
  listing: BookingListingSummary;
  checkIn: string;
  checkOut: string;
  guestLabel: string;
  quote?: PricingBreakdown | null;
  promoDiscount?: number | null;
  creditApplied?: number;
  totalDue?: number | null;
  loading?: boolean;
  className?: string;
}) {
  const currency = quote?.currency ?? "USD";
  const afterPromo = quote
    ? Math.max(0, quote.total_cents - (promoDiscount ?? 0))
    : null;
  const due =
    totalDue ??
    (afterPromo != null ? Math.max(0, afterPromo - creditApplied) : null);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[#dfe6e1] bg-white shadow-sm",
        className,
      )}
    >
      <div className="relative h-40 w-full bg-[#eceeec]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.imageUrl || FALLBACK_IMG}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="space-y-4 p-5">
        <div>
          <Link
            href={`/listings/${listing.slug}`}
            className="font-(family-name:--font-lora) text-lg font-semibold text-[#1d6fb8] hover:underline"
          >
            {listing.title}
          </Link>
          {listing.location ? (
            <p className="mt-1 text-sm text-[#5f6b66]">{listing.location}</p>
          ) : null}
        </div>

        <div className="rounded-xl bg-[#f4f6f5] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
            Your stay
          </p>
          <p className="mt-2 text-sm font-semibold text-[#1f2937]">
            {formatStayRange(checkIn, checkOut)}
          </p>
          <p className="mt-1 text-sm text-[#5f6b66]">{guestLabel}</p>
        </div>

        <div className="space-y-2 text-sm">
          {loading ? (
            <p className="text-[#6b7280]">Calculating price…</p>
          ) : quote ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-[#5f6b66]">
                  {quote.nights} night{quote.nights === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums text-[#1f2937]">
                  {formatMoney(quote.subtotal_cents, currency)}
                </span>
              </div>
              {quote.fees.map((f) => (
                <div key={`${f.kind}-${f.label}`} className="flex justify-between gap-3">
                  <span className="text-[#5f6b66]">{f.label}</span>
                  <span className="tabular-nums text-[#1f2937]">
                    {formatMoney(f.amount_cents, currency)}
                  </span>
                </div>
              ))}
              {quote.taxes.map((t, i) => (
                <div
                  key={`${t.jurisdiction}-${t.kind}-${i}`}
                  className="flex justify-between gap-3"
                >
                  <span className="text-[#5f6b66]">Tax · {t.jurisdiction}</span>
                  <span className="tabular-nums text-[#1f2937]">
                    {formatMoney(t.amount_cents, currency)}
                  </span>
                </div>
              ))}
              {(promoDiscount ?? 0) > 0 ? (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>Promo</span>
                  <span className="tabular-nums">
                    −{formatMoney(promoDiscount!, currency)}
                  </span>
                </div>
              ) : null}
              {creditApplied > 0 ? (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>Credits applied</span>
                  <span className="tabular-nums">
                    −{formatMoney(creditApplied, currency)}
                  </span>
                </div>
              ) : null}
              <div className="border-t border-[#dfe6e1] pt-3">
                <div className="flex justify-between gap-3 text-base font-semibold text-[#143328]">
                  <span>
                    {due != null &&
                    afterPromo != null &&
                    due < afterPromo
                      ? "Due now"
                      : "Total"}
                  </span>
                  <span className="tabular-nums">
                    {due != null
                      ? formatMoney(due, currency)
                      : formatMoney(quote.total_cents, currency)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[#6b7280]">Select valid dates to see pricing.</p>
          )}
        </div>
      </div>
    </div>
  );
}
