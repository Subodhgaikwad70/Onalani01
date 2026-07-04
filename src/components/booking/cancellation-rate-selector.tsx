"use client";

import { cn } from "@/lib/utils";
import type { CancellationRateOption } from "@/lib/bookings/cancellation-policies";
import { formatMoney } from "@/lib/format";

export function CancellationRateSelector({
  options,
  selectedKey,
  onSelect,
  currency,
  nights,
  loading,
  className,
}: {
  options: CancellationRateOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  currency: string;
  nights?: number;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("animate-pulse rounded-xl border border-[#dddddd] p-4", className)}>
        <div className="h-3 w-12 rounded bg-[#ebebeb]" />
        <div className="mt-4 space-y-3">
          <div className="h-14 rounded-lg bg-[#f7f7f7]" />
          <div className="h-14 rounded-lg bg-[#f7f7f7]" />
        </div>
      </div>
    );
  }

  if (options.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#717171]">
        Rates
      </p>
      <div className="overflow-hidden rounded-xl border border-[#dddddd]">
        {options.map((option, index) => {
          const selected = option.key === selectedKey;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelect(option.key)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-[#fafafa]",
                index > 0 && "border-t border-[#dddddd]",
                selected && "bg-[#fafafa]",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#222222]">
                  <span>{option.label}</span>
                  <span className="text-[#717171]"> · </span>
                  <span>{formatMoney(option.total_cents, currency)} total</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#717171]">
                  {option.summary}
                </p>
              </div>
              <span
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                  selected
                    ? "border-[#222222]"
                    : "border-[#b0b0b0] bg-white",
                )}
                aria-hidden
              >
                {selected ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#222222]" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {nights != null && nights > 0 ? (
        <p className="text-center text-xs text-[#717171]">
          Totals include fees and taxes for {nights} night{nights === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
