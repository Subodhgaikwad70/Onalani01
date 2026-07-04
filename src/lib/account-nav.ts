import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Bell,
  Bookmark,
  Coins,
  Flag,
  Heart,
  LayoutDashboard,
  MessageCircle,
  UserRound,
} from "lucide-react";

export type AccountNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: "exact" | "prefix";
};

/** Primary navigation for the signed-in guest account area (header profile menu). */
export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { href: "/account", label: "Dashboard", icon: LayoutDashboard, match: "exact" },
  { href: "/account/trips", label: "Trips", icon: BedDouble, match: "prefix" },
  { href: "/account/saved-searches", label: "Saved searches", icon: Bookmark, match: "prefix" },
  { href: "/account/wishlists", label: "Wishlists", icon: Heart, match: "prefix" },
  { href: "/account/credits", label: "Credits", icon: Coins, match: "prefix" },
  { href: "/account/messages", label: "Messages", icon: MessageCircle, match: "prefix" },
  { href: "/account/notifications", label: "Notifications", icon: Bell, match: "prefix" },
  { href: "/account/profile", label: "Profile", icon: UserRound, match: "prefix" },
  { href: "/account/complaints", label: "Help & complaints", icon: Flag, match: "prefix" },
];
