import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cancels parent page padding so the inbox shell sits flush inside the layout card
 * (avoids double margin / nested border at the top).
 */
export function MessagingInboxBleed({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-5 -mt-5 -mb-5 flex h-[calc(100dvh-10.5rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl md:-mx-8 md:-mt-8 md:-mb-8 lg:-mx-10 lg:-mt-10 lg:-mb-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
