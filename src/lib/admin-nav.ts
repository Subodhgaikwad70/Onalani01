import type { AccountNavItem } from "@/lib/account-nav";
import {
  Armchair,
  Building2,
  Calendar,
  FileSearch,
  Flag,
  FolderTree,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  Tag,
  Users,
} from "lucide-react";

/** Admin console navigation. */
export const ADMIN_NAV_ITEMS: AccountNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, match: "exact" },
  { href: "/admin/properties", label: "Properties", icon: Building2, match: "prefix" },
  { href: "/admin/calendar", label: "Calendar", icon: Calendar, match: "prefix" },
  { href: "/admin/inbox", label: "Inbox", icon: MessageSquare, match: "prefix" },
  { href: "/admin/bookings", label: "Bookings", icon: Receipt, match: "prefix" },
  { href: "/admin/complaints", label: "Complaints", icon: Flag, match: "prefix" },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw, match: "prefix" },
  { href: "/admin/credits/lots", label: "Credit lots", icon: Package, match: "prefix" },
  { href: "/admin/credits/grants", label: "Credit grants", icon: Gift, match: "prefix" },
  { href: "/admin/promos", label: "Promos", icon: Tag, match: "prefix" },
  { href: "/admin/amenities", label: "Amenities", icon: Armchair, match: "prefix" },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, match: "prefix" },
  { href: "/admin/tax-rates", label: "Tax rates", icon: Receipt, match: "prefix" },
  { href: "/admin/users", label: "Users", icon: Users, match: "prefix" },
  { href: "/admin/settings", label: "Settings", icon: Settings, match: "prefix" },
  { href: "/admin/audit", label: "Audit log", icon: FileSearch, match: "prefix" },
];
