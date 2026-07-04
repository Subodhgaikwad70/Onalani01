"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { formatPropertyLocation, getPropertyPrimaryPhoto } from "@/lib/properties";
import { cn } from "@/lib/utils";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=200&q=75";

type PropertyStatus = "draft" | "pending_review" | "published" | "suspended";

type AdminProperty = {
  id: string;
  slug: string;
  property_name: string;
  description: string | null;
  photos_url: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  max_guests: number | null;
  is_active: boolean;
  status: PropertyStatus | null;
  instant_book: boolean | null;
  timezone: string | null;
  beds24_property_id: string | null;
  created_at: string;
};

async function readError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (j as { error?: { message?: string } }).error?.message ?? fallback;
}

function statusBadge(status: PropertyStatus | null, isActive: boolean) {
  if (!isActive || status === "suspended") {
    return <Badge variant="outline">Suspended</Badge>;
  }
  switch (status) {
    case "published":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Published</Badge>;
    case "pending_review":
      return <Badge variant="secondary">Pending review</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

export function AdminPropertiesClient() {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminProperty | null>(null);
  const [deleting, setDeleting] = useState<AdminProperty | null>(null);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editMaxGuests, setEditMaxGuests] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editStatus, setEditStatus] = useState<PropertyStatus>("draft");
  const [editInstantBook, setEditInstantBook] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editBeds24Id, setEditBeds24Id] = useState("");

  const propertiesQuery = useQuery({
    queryKey: ["admin-properties"],
    queryFn: async () => {
      const res = await fetch("/api/admin/properties", { credentials: "include" });
      if (!res.ok) throw new Error(await readError(res, "Failed to load properties"));
      return res.json() as Promise<{ properties: AdminProperty[] }>;
    },
  });

  const properties = propertiesQuery.data?.properties ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => {
      const loc = formatPropertyLocation(p).toLowerCase();
      const blob = [p.property_name, p.slug, loc, p.status].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [properties, search]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const body: Record<string, unknown> = {
        property_name: editName.trim(),
        description: editDescription.trim() || null,
        address: editAddress.trim() || null,
        city: editCity.trim() || null,
        state: editState.trim() || null,
        country: editCountry.trim() || null,
        timezone: editTimezone.trim() || null,
        beds24_property_id: editBeds24Id.trim() || null,
        status: editStatus,
        instant_book: editInstantBook,
        is_active: editIsActive,
      };
      if (editMaxGuests.trim()) {
        const v = Number.parseInt(editMaxGuests, 10);
        if (!Number.isFinite(v) || v < 1) throw new Error("Max guests must be a positive number.");
        body.max_guests = v;
      } else {
        body.max_guests = null;
      }

      const res = await fetch(`/api/admin/properties/${editing.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update property"));
    },
    onSuccess: () => {
      toast.success("Property updated");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-properties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (property: AdminProperty) => {
      const res = await fetch(`/api/admin/properties/${property.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete property"));
    },
    onSuccess: () => {
      toast.success("Property suspended");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["admin-properties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(property: AdminProperty) {
    setEditing(property);
    setEditName(property.property_name);
    setEditDescription(property.description ?? "");
    setEditAddress(property.address ?? "");
    setEditCity(property.city ?? "");
    setEditState(property.state ?? "");
    setEditCountry(property.country ?? "");
    setEditMaxGuests(property.max_guests != null ? String(property.max_guests) : "");
    setEditTimezone(property.timezone ?? "");
    setEditStatus(property.status ?? "draft");
    setEditInstantBook(property.instant_book ?? false);
    setEditIsActive(property.is_active);
    setEditBeds24Id(property.beds24_property_id ?? "");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold tracking-tight">
          Properties
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search properties…"
              className="h-10 w-full pl-9 sm:w-56"
              aria-label="Search properties"
            />
          </div>
          <Button asChild>
            <Link href="/admin/properties/new">
              <Plus className="mr-2 h-4 w-4" />
              New property
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px]">Property</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {propertiesQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  {properties.length === 0 ? (
                    <div className="space-y-3">
                      <p>No properties yet.</p>
                      <Button asChild size="sm">
                        <Link href="/admin/properties/new">Create your first property</Link>
                      </Button>
                    </div>
                  ) : (
                    "No properties match your search."
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((property) => {
                const thumb = getPropertyPrimaryPhoto(property) ?? FALLBACK_THUMB;
                const loc = formatPropertyLocation(property);
                return (
                  <TableRow
                    key={property.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/properties/${property.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
                        />
                        <div className="min-w-0">
                          <p className="font-medium leading-snug">{property.property_name}</p>
                          <p className="text-xs text-muted-foreground">{property.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{loc || "—"}</TableCell>
                    <TableCell>{statusBadge(property.status, property.is_active)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(property.created_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/admin/properties/${property.id}`)}
                          >
                            View listings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(property)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(property)}
                          >
                            Suspend
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit property</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-city">City</Label>
                <Input id="edit-city" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-country">Country</Label>
                <Input
                  id="edit-country"
                  value={editCountry}
                  onChange={(e) => setEditCountry(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-state">State</Label>
                <Input
                  id="edit-state"
                  value={editState}
                  onChange={(e) => setEditState(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-max-guests">Max guests</Label>
                <Input
                  id="edit-max-guests"
                  type="number"
                  min={1}
                  value={editMaxGuests}
                  onChange={(e) => setEditMaxGuests(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-timezone">Timezone</Label>
                <Input
                  id="edit-timezone"
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  placeholder="America/New_York"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-beds24">Beds24 property ID</Label>
                <Input
                  id="edit-beds24"
                  value={editBeds24Id}
                  onChange={(e) => setEditBeds24Id(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as PropertyStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_review">Pending review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="edit-instant-book">Instant book</Label>
                <p className="text-xs text-muted-foreground">Allow guests to book without approval</p>
              </div>
              <Switch
                id="edit-instant-book"
                checked={editInstantBook}
                onCheckedChange={setEditInstantBook}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="edit-is-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive properties are hidden from guests</p>
              </div>
              <Switch
                id="edit-is-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || !editName.trim()}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set <strong>{deleting?.property_name}</strong> to suspended and inactive.
              Existing listings will remain but won&apos;t be bookable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => deleting && deleteMutation.mutate(deleting)}
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
