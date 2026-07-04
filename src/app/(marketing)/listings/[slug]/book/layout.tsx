import type { ReactNode } from "react";

export default function BookListingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#f0f2f1] text-[#1f2937]">{children}</div>
  );
}
