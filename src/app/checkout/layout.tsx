import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f0f2f1] text-[#1f2937]">
      <SiteHeader variant="light" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
