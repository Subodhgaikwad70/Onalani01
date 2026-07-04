import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { isAdminRole } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/auth/login?next=/account");
  if (isAdminRole(ctx.role)) redirect("/admin");

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1f2937]">
      <SiteHeader variant="light" />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 md:px-6">
        <main className="min-w-0 w-full h-full flex-1">
          <div className="flex-1 bg-[#F7F7F7] px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
