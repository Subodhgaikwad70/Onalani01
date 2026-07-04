import { cn } from "@/lib/utils";

export function BookingGuestStepper({
  label,
  value,
  minimum,
  maximum,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum?: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-[#1f2937]">{label}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={value <= minimum}
          aria-label={`Decrease ${label}`}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border text-lg leading-none transition",
            value <= minimum
              ? "cursor-not-allowed border-[#e5e7eb] text-[#cbd5e1]"
              : "border-[#cfd8d3] text-[#5f6b66] hover:border-[#2d6a4f] hover:text-[#143328]",
          )}
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums text-[#1f2937]">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={maximum != null && value >= maximum}
          aria-label={`Increase ${label}`}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border text-lg leading-none transition",
            maximum != null && value >= maximum
              ? "cursor-not-allowed border-[#e5e7eb] text-[#cbd5e1]"
              : "border-[#cfd8d3] text-[#5f6b66] hover:border-[#2d6a4f] hover:text-[#143328]",
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
