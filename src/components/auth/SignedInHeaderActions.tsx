"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiPost } from "@/lib/api/client";
import { ACCOUNT_NAV_ITEMS } from "@/lib/account-nav";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-nav";
import { isAdminRole } from "@/lib/auth/roles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSupabaseSession } from "@/lib/supabase/session-context";

function initials(email: string | null | undefined) {
  if (!email) return "?";
  const part = email.split("@")[0]?.slice(0, 2) ?? "?";
  return part.toUpperCase();
}

const menuLink = "cursor-pointer text-foreground";

export function SignedInHeaderActions({
  variant = "hero",
  quickMessaging = true,
  showLocale = true,
}: {
  variant?: "hero" | "light";
  quickMessaging?: boolean;
  showLocale?: boolean;
}) {
  const router = useRouter();
  const { user, isLoading } = useSupabaseSession();
  const isHero = variant === "hero";

  const muted = isHero ? "text-white/80" : "text-muted-foreground";

  async function onLogout() {
    try {
      await apiPost<{ ok: boolean }>("/api/auth/logout");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      toast.success("Signed out");
      router.refresh();
      router.push("/");
    } catch {
      toast.error("Could not sign out");
    }
  }

  if (isLoading) {
    return <LoadingPlaceholder isHero={isHero} />;
  }

  if (!user?.email) {
    return (
      <div className="flex items-center gap-2 md:gap-3">
        <span
          className={`hidden text-xs font-medium tracking-wide sm:inline ${muted}`}
        >
          EN · USD
        </span>
        <Link
          href="/auth/login"
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition md:px-5 ${isHero ? "border border-white/40 text-white hover:bg-white/10" : "border border-border bg-card text-foreground hover:bg-muted"}`}
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className={`rounded-full px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm transition md:px-5 ${isHero ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
        >
          Sign up
        </Link>
      </div>
    );
  }

  const staff = isAdminRole(user.role);
  const messagesHref = staff ? "/admin/inbox" : "/account/messages";

  const portalSectionLabel =
    "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="flex items-center gap-2 md:gap-3">
      {showLocale ? (
        <span className={`hidden text-xs font-medium tracking-wide sm:inline ${muted}`}>
          EN · USD
        </span>
      ) : null}

      {quickMessaging ? (
        <>
          {!staff ? (
            <Button
              variant="ghost"
              size="icon"
              className={isHero ? "text-white hover:bg-white/10" : ""}
              asChild
            >
              <Link href="/account/notifications" aria-label="Notifications">
                <Bell className="h-5 w-5" />
              </Link>
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className={isHero ? "text-white hover:bg-white/10" : ""}
            asChild
          >
            <Link href={messagesHref} aria-label="Messages">
              <MessageCircle className="h-5 w-5" />
            </Link>
          </Button>
        </>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-transparent outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="h-9 w-9 border border-white/30 bg-card">
              <AvatarFallback>{initials(user.email)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[min(75vh,560px)] min-w-56 max-w-[calc(100vw-2rem)] overflow-y-auto sm:w-60"
        >
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {staff ? (
            <>
              <DropdownMenuLabel className={portalSectionLabel}>Admin console</DropdownMenuLabel>
              {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className={menuLink}>
                    <Icon className="mr-2 h-4 w-4 shrink-0 opacity-80" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <>
              {ACCOUNT_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className={menuLink}>
                    <Icon className="mr-2 h-4 w-4 shrink-0 opacity-80" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LoadingPlaceholder({ isHero }: { isHero: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-9 w-20 animate-pulse rounded-full ${isHero ? "bg-white/20" : "bg-muted"}`}
      />
    </div>
  );
}
