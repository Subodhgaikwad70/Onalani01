import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#2d3330]">
      <SiteHeader variant="light" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
