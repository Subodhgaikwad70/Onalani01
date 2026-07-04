import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Account shell uses uniform p-5 — bleed inbox to the layout edges. */
export default function AccountMessagesLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "-mx-5 -mt-5 -mb-5 flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col overflow-hidden",
      )}
    >
      {children}
    </div>
  );
}
