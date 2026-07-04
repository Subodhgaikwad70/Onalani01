"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignedInHeaderActions } from "@/components/auth/SignedInHeaderActions";
import { SiteLogo } from "@/components/site-logo";

const ADMIN_TABS: Array<{ href: string; label: string; isActive: (pathname: string) => boolean }> =
  [
    { href: "/admin", label: "Dashboard", isActive: (p) => p === "/admin" },
    {
      href: "/admin/calendar",
      label: "Calendar",
      isActive: (p) => p === "/admin/calendar" || p.startsWith("/admin/calendar/"),
    },
    {
      href: "/admin/bookings",
      label: "Reservations",
      isActive: (p) =>
        p === "/admin/bookings" || p.startsWith("/admin/bookings/"),
    },
    {
      href: "/admin/properties",
      label: "Listings",
      isActive: (p) =>
        p.startsWith("/admin/properties") || p.startsWith("/admin/listings"),
    },
    {
      href: "/admin/inbox",
      label: "Messages",
      isActive: (p) => p === "/admin/inbox" || p.startsWith("/admin/inbox/"),
    },
  ];

export function AdminPortalHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[#ebebeb] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 md:gap-6 md:px-8">
        <Link href="/admin" className="shrink-0">
          <SiteLogo variant="light" />
        </Link>

        <nav
          className="mx-auto flex min-w-0 flex-1 justify-center gap-5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-10 [&::-webkit-scrollbar]:hidden"
          aria-label="Admin portal"
        >
          {ADMIN_TABS.map(({ href, label, isActive }) => {
            const active = isActive(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative shrink-0 whitespace-nowrap pb-1 text-sm font-medium transition-colors",
                  active
                    ? "text-[#222222] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-[#222222]"
                    : "text-[#717171] hover:text-[#222222]",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          <SignedInHeaderActions
            variant="light"
            quickMessaging={false}
            showLocale={false}
          />
        </div>
      </div>
    </header>
  );
}
