import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader variant="light" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        {children}
      </main>
    </div>
  );
}
