"use client";

import { cn } from "@/lib/utils";
import {
  getCancellationPolicyDisplay,
  type CancellationPolicyDisplay,
} from "@/lib/bookings/cancellation-policies";

export function CancellationPolicyPanel({
  policyKey,
  policy,
  compact = false,
  className,
}: {
  policyKey?: string | null;
  policy?: CancellationPolicyDisplay;
  compact?: boolean;
  className?: string;
}) {
  const display = policy ?? getCancellationPolicyDisplay(policyKey);

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <div>
          <p className="text-sm font-semibold text-[#1e6a82]">{display.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#5f6b66]">
            {display.tagline}
          </p>
        </div>
        <ul className="space-y-1.5 text-xs text-[#5f6b66]">
          {display.tiers.map((tier) => (
            <li key={tier.windowLabel}>
              <span className="font-medium text-[#374151]">
                {tier.windowLabel}:
              </span>{" "}
              {tier.cashRefund !== "None" ? (
                <span className="text-emerald-700">{tier.cashRefund} cash</span>
              ) : (
                <span className="text-amber-700">No cash</span>
              )}
              {tier.creditIssued !== "None needed" ? (
                <> · {tier.creditIssued}</>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
          Cancellation policy
        </p>
        <h3 className="mt-1 font-[family-name:var(--font-lora)] text-lg font-semibold text-[#1e6a82]">
          {display.label}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#5f6b66]">
          {display.tagline}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#dfe6e1]">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#dfe6e1] bg-[#fafcfb] text-xs font-bold uppercase tracking-wide text-[#6b7280]">
              <th className="px-4 py-3">Cancellation window</th>
              <th className="px-4 py-3">Cash refund</th>
              <th className="px-4 py-3">Credits</th>
              <th className="hidden px-4 py-3 sm:table-cell">How it works</th>
            </tr>
          </thead>
          <tbody>
            {display.tiers.map((tier) => (
              <tr
                key={tier.windowLabel}
                className="border-b border-[#eceeec] last:border-0"
              >
                <td className="px-4 py-3 font-medium text-[#374151]">
                  {tier.windowLabel}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-semibold",
                      tier.cashRefund === "None" || tier.cashRefund === "0%"
                        ? "text-amber-700"
                        : "text-emerald-700",
                    )}
                  >
                    {tier.cashRefund}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#5f6b66]">{tier.creditIssued}</td>
                <td className="hidden px-4 py-3 text-xs leading-relaxed text-[#6b7280] sm:table-cell">
                  {tier.howItWorks}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#9ca3af]">
        Recovery credits are issued when your cancelled dates are rebooked by
        another guest. Guaranteed minimum credits are issued immediately when
        you cancel.
      </p>
    </div>
  );
}
