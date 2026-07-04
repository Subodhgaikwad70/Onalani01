"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Gift,
  MessageSquare,
  MoreHorizontal,
  Shield,
  UserX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  display_name: string;
  role: "guest" | "admin" | "super_admin";
  avatar_url: string | null;
  archived_at: string | null;
  created_at: string;
};

type RoleFilter = "" | "guest" | "staff" | "admin" | "super_admin";
type StatusFilter = "" | "active" | "suspended";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm";

async function readError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (j as { error?: { message?: string } }).error?.message ?? fallback;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function roleLabel(role: AdminUser["role"]): string {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    default:
      return "Guest";
  }
}

function roleBadgeVariant(
  role: AdminUser["role"],
): "default" | "secondary" | "outline" {
  switch (role) {
    case "super_admin":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

export function AdminUsersClient() {
  const router = useRouter();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState<AdminUser["role"]>("guest");

  const meQuery = useQuery({
    queryKey: ["admin-me"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (!res.ok) throw new Error("me");
      return res.json() as Promise<{ role: string; profile: { id: string } }>;
    },
  });

  const isSuperAdmin = meQuery.data?.role === "super_admin";
  const currentUserId = meQuery.data?.profile.id;

  const usersQuery = useQuery({
    queryKey: ["admin-users", page, search, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (search) params.set("q", search);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to load users"));
      return res.json() as Promise<{
        users: AdminUser[];
        page: number;
        limit: number;
        total: number;
      }>;
    },
  });

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const stats = useMemo(() => {
    const active = users.filter((u) => !u.archived_at).length;
    const suspended = users.filter((u) => u.archived_at).length;
    return { active, suspended };
  }, [users]);

  const suspendMutation = useMutation({
    mutationFn: async () => {
      if (!suspendTarget) throw new Error("No user selected");
      const reason = suspendReason.trim();
      if (reason.length < 3) throw new Error("Reason must be at least 3 characters");

      const res = await fetch("/api/admin/suspensions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: suspendTarget.id,
          reason,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Suspend failed"));
    },
    onSuccess: () => {
      toast.success("User suspended");
      setSuspendTarget(null);
      setSuspendReason("");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Suspend failed");
    },
  });

  const roleMutation = useMutation({
    mutationFn: async () => {
      if (!roleTarget) throw new Error("No user selected");
      const res = await fetch(`/api/admin/users/${roleTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error(await readError(res, "Role update failed"));
    },
    onSuccess: () => {
      toast.success("Role updated");
      setRoleTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Role update failed");
    },
  });

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("User ID copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function openMessage(user: AdminUser) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: user.id }),
      });
      const j = (await res.json()) as {
        conversation?: { id: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.error(j.error?.message ?? "Could not open conversation");
        return;
      }
      const id = j.conversation?.id;
      if (!id) {
        toast.error("Conversation missing from response");
        return;
      }
      router.push(`/admin/inbox/${id}`);
    } catch {
      toast.error("Could not open conversation");
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  function openSuspend(user: AdminUser) {
    setSuspendTarget(user);
    setSuspendReason("");
  }

  function openRoleChange(user: AdminUser) {
    setRoleTarget(user);
    setNewRole(user.role);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
            <Link href="/admin" aria-label="Back to admin home">
              <ArrowLeft className="h-5 w-5 text-[#222222]" />
            </Link>
          </Button>
          <div>
            <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold tracking-tight text-[#222222] md:text-3xl">
              Users
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[#717171]">
              Browse all profiles, search by name or ID, and take action on individual accounts.
            </p>
          </div>
        </div>
        <div className="text-right text-sm text-[#717171]">
          <p className="font-medium text-[#222222]">{total.toLocaleString()} total</p>
          {!usersQuery.isPending && users.length > 0 ? (
            <p className="text-xs">
              This page: {stats.active} active · {stats.suspended} suspended
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#ebebeb] bg-[#fafafa] p-4">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="user-search" className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
            Search
          </Label>
          <div className="flex gap-2">
            <Input
              id="user-search"
              placeholder="Name or user ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <Button type="button" variant="secondary" onClick={applySearch}>
              Search
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role-filter" className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
            Role
          </Label>
          <select
            id="role-filter"
            className={cn(selectClass, "min-w-[140px]")}
            value={roleFilter}
            onChange={(e) => {
              setPage(1);
              setRoleFilter(e.target.value as RoleFilter);
            }}
          >
            <option value="">All roles</option>
            <option value="guest">Guests</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status-filter" className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
            Status
          </Label>
          <select
            id="status-filter"
            className={cn(selectClass, "min-w-[140px]")}
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as StatusFilter);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {(search || roleFilter || statusFilter) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[#717171]"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setRoleFilter("");
              setStatusFilter("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#ebebeb] bg-white shadow-sm">
        {usersQuery.isPending ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground">
            No users found{search ? " matching your search" : ""}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[72px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const suspended = Boolean(user.archived_at);
                const isSelf = user.id === currentUserId;

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {user.avatar_url ? (
                            <AvatarImage src={user.avatar_url} alt="" />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {initials(user.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#222222]">
                            {user.display_name}
                            {isSelf ? (
                              <span className="ml-2 text-xs font-normal text-[#717171]">
                                (you)
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate font-mono text-xs text-[#717171]">
                            {user.id}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {suspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-[#717171]">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Actions for ${user.display_name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => void copyId(user.id)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy user ID
                          </DropdownMenuItem>
                          {!suspended ? (
                            <DropdownMenuItem onClick={() => void openMessage(user)}>
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Message
                            </DropdownMenuItem>
                          ) : null}
                          {!suspended && user.role === "guest" ? (
                            <DropdownMenuItem asChild>
                              <Link href="/admin/credits/grants">
                                <Gift className="mr-2 h-4 w-4" />
                                Grant credits
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          {isSuperAdmin && !suspended && !isSelf ? (
                            <DropdownMenuItem onClick={() => openRoleChange(user)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Change role
                            </DropdownMenuItem>
                          ) : null}
                          {!suspended && !isSelf ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => openSuspend(user)}
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Suspend user
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[#717171]">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || usersQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || usersQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(suspendTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendTarget(null);
            setSuspendReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend user</DialogTitle>
            <DialogDescription>
              {suspendTarget
                ? `This archives ${suspendTarget.display_name}'s profile and blocks future access. This action is logged in the audit trail.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              placeholder="Describe why this account is being suspended…"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSuspendTarget(null);
                setSuspendReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={suspendMutation.isPending || suspendReason.trim().length < 3}
              onClick={() => suspendMutation.mutate()}
            >
              {suspendMutation.isPending ? "Suspending…" : "Suspend user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(roleTarget)}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {roleTarget
                ? `Update portal access for ${roleTarget.display_name}. JWT claims are updated immediately.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              className={selectClass}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminUser["role"])}
            >
              <option value="guest">Guest</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                roleMutation.isPending ||
                !roleTarget ||
                newRole === roleTarget.role
              }
              onClick={() => roleMutation.mutate()}
            >
              {roleMutation.isPending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
