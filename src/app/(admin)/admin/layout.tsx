import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { getSessionContext } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/auth/login?next=/admin");
  if (!isAdminRole(ctx.role)) redirect("/403");

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1f2937]">
      <SiteHeader variant="light" />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
        <main className="min-w-0 w-full flex-1">
          <div className="rounded-2xl bg-white p-5 shadow-sm md:p-8 lg:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
