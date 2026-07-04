import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared account route shell — matches /account/trips outer structure
 * (full width within layout max-w-7xl, identical header alignment).
 */
export function AccountPageShell({
  breadcrumb,
  title,
  description,
  children,
  className,
}: {
  breadcrumb?: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-8", className)}>
      {breadcrumb}
      <header className="">
        <h1 className="font-(family-name:--font-lora) text-3xl font-semibold tracking-tight text-[#1e6a82] md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm text-[#6b7280]">{description}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}

/** Section label aligned with Trips tab subheaders. */
export function AccountSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">
      {children}
    </p>
  );
}
