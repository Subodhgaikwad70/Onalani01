import { cn } from "@/lib/utils";

export type BookingFlowStep = "dates" | "review" | "payment" | "confirmation";

const STEPS: { key: BookingFlowStep; label: string }[] = [
  { key: "dates", label: "Dates & guests" },
  { key: "review", label: "Review stay" },
  { key: "payment", label: "Payment" },
  { key: "confirmation", label: "Confirmation" },
];

export function BookingStepIndicator({
  current,
  className,
}: {
  current: BookingFlowStep;
  className?: string;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label="Booking progress" className={cn("w-full", className)}>
      <ol className="flex flex-wrap items-center gap-2 sm:gap-0">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.key} className="flex min-w-0 items-center sm:flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    done
                      ? "bg-[#2d6a4f] text-white"
                      : active
                        ? "bg-[#143328] text-white ring-2 ring-[#2d6a4f]/25"
                        : "bg-[#eceeec] text-[#9ca3af]",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span
                  className={cn(
                    "truncate text-xs font-semibold sm:text-sm",
                    active
                      ? "text-[#143328]"
                      : done
                        ? "text-[#2d6a4f]"
                        : "text-[#9ca3af]",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 hidden h-px flex-1 sm:block",
                    done ? "bg-[#2d6a4f]" : "bg-[#dfe6e1]",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
