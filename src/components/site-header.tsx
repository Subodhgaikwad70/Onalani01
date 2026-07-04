"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SignedInHeaderActions } from "@/components/auth/SignedInHeaderActions";
import { SiteLogo } from "@/components/site-logo";
import { isAdminRole } from "@/lib/auth/roles";
import { useSupabaseSession } from "@/lib/supabase/session-context";

const navLink =
  "rounded-full px-3 py-2 text-sm font-medium text-[#3d4543] transition hover:bg-[#ececec] hover:text-[#1a1f1e]";
const navLinkHero =
  "rounded-full px-3 py-2 text-sm font-medium text-white/95 transition hover:bg-white/10 hover:text-white";

export function SiteHeader({ variant = "hero" }: { variant?: "hero" | "light" }) {
  const isHero = variant === "hero";
  const { user } = useSupabaseSession();

  const navItems = useMemo(() => {
    const baseItems = [{ href: "/properties", label: "Search" }];

    if (!user) return baseItems;

    if (isAdminRole(user.role)) {
      return [
        ...baseItems,
        { href: "/admin", label: "Admin" },
        { href: "/admin/bookings", label: "Bookings" },
        { href: "/admin/inbox", label: "Inbox" },
      ];
    }

    return [
      ...baseItems,
      { href: "/account/trips", label: "Trips" },
      { href: "/account/messages", label: "Inbox" },
    ];
  }, [user]);

  return (
    <header
      className={
        isHero
          ? "absolute inset-x-0 top-0 z-30"
          : "sticky top-0 z-30 border-b border-[#e8e8e8] bg-white/95 backdrop-blur-sm"
      }
    >
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-6">
        <SiteLogo variant={isHero ? "hero" : "light"} />

        <div className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isHero ? navLinkHero : navLink}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <SignedInHeaderActions variant={isHero ? "hero" : "light"} />

        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {navItems.map((item) => (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={isHero ? navLinkHero : navLink}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
