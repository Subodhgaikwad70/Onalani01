import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookingStepIndicator,
  type BookingFlowStep,
} from "@/components/booking/booking-step-indicator";
import { cn } from "@/lib/utils";

export function BookingFlowShell({
  step,
  backHref,
  backLabel,
  title,
  subtitle,
  children,
  sidebar,
  className,
}: {
  step: BookingFlowStep;
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  sidebar?: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10", className)}>
      <Link
        href={backHref}
        className="inline-flex items-center text-sm font-semibold text-[#1d6fb8] hover:underline"
      >
        ← {backLabel}
      </Link>

      <header className="mt-6 space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
            Book your stay
          </p>
          <h1 className="mt-2 font-(family-name:--font-lora) text-2xl font-semibold text-[#1f2937] md:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5f6b66]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <BookingStepIndicator current={step} />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="min-w-0 space-y-6">{children}</div>
        {sidebar ? <aside className="min-w-0 lg:sticky lg:top-24">{sidebar}</aside> : null}
      </div>
    </main>
  );
}
