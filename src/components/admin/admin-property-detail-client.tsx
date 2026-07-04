"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ApiError, apiDelete } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { getListingPrimaryPhoto } from "@/lib/listings";
import {
  formatPropertyLocation,
  getPropertyPrimaryPhoto,
} from "@/lib/properties";
import { cn } from "@/lib/utils";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=800&q=75";

const LISTING_THUMB =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=200&q=75";

type PropertyListing = {
  id: string;
  slug: string;
  unit_type: string | null;
  unit_description: string | null;
  unit_occupancy: number | null;
  unit_bathrooms: number | string | null;
  photos_url: string[];
  base_price_cents: number | null;
  currency: string | null;
  min_nights: number | null;
  max_nights: number | null;
  instant_book: boolean | null;
  is_active: boolean;
};

type PropertyDetail = {
  id: string;
  slug: string;
  property_name: string;
  description: string | null;
  status: string;
  is_active: boolean;
  instant_book: boolean | null;
  max_guests: number | null;
  timezone: string | null;
  beds24_property_id: string | null;
  list_of_amenities: string[];
  photos_url: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  listings: PropertyListing[];
};

async function readError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (j as { error?: { message?: string } }).error?.message ?? fallback;
}

function statusLabel(status: string, isActive: boolean): string {
  if (!isActive || status === "suspended") return "Inactive";
  switch (status) {
    case "published":
      return "Published";
    case "pending_review":
      return "Pending review";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}

function statusColor(status: string, isActive: boolean): string {
  if (!isActive || status === "suspended") return "bg-neutral-400";
  switch (status) {
    case "published":
      return "bg-emerald-500";
    case "pending_review":
      return "bg-amber-500";
    default:
      return "bg-neutral-400";
  }
}

function listingLabel(listing: PropertyListing): string {
  if (listing.unit_type?.trim()) return listing.unit_type.trim();
  const line = listing.unit_description?.split("\n").find((l) => l.trim())?.trim();
  if (line) return line.length > 80 ? `${line.slice(0, 77)}…` : line;
  return listing.slug;
}

function dollarsToCents(dollars: string): number | null {
  const n = Number.parseFloat(dollars.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToDollars(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function AdminPropertyDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<PropertyListing | null>(null);
  const [deleting, setDeleting] = useState<PropertyListing | null>(null);

  const [editUnitType, setEditUnitType] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOccupancy, setEditOccupancy] = useState("");
  const [editBathrooms, setEditBathrooms] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editMinNights, setEditMinNights] = useState("1");
  const [editMaxNights, setEditMaxNights] = useState("");
  const [editInstantBook, setEditInstantBook] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  const propertyQuery = useQuery({
    queryKey: ["admin-property", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/properties/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to load property"));
      return res.json() as Promise<{ property: PropertyDetail }>;
    },
    retry: false,
  });

  const p = propertyQuery.data?.property;
  const thumb = p ? (getPropertyPrimaryPhoto(p) ?? FALLBACK_THUMB) : FALLBACK_THUMB;
  const location = p ? formatPropertyLocation(p) : "";
  const listings = p?.listings ?? [];

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const priceCents = dollarsToCents(editPrice.trim());
      if (editPrice.trim() && priceCents == null) {
        throw new Error("Enter a valid nightly price.");
      }

      const body: Record<string, unknown> = {
        unit_type: editUnitType.trim() || null,
        unit_description: editDescription.trim() || null,
        currency: editCurrency.trim() || "USD",
        instant_book: editInstantBook,
        is_active: editIsActive,
      };

      if (editOccupancy.trim()) {
        const v = Number.parseInt(editOccupancy, 10);
        if (!Number.isFinite(v) || v < 0) throw new Error("Occupancy must be a non-negative number.");
        body.unit_occupancy = v;
      } else {
        body.unit_occupancy = null;
      }

      if (editBathrooms.trim()) {
        const v = Number.parseFloat(editBathrooms);
        if (!Number.isFinite(v) || v < 0) throw new Error("Bathrooms must be a non-negative number.");
        body.unit_bathrooms = v;
      } else {
        body.unit_bathrooms = null;
      }

      if (priceCents != null) body.base_price_cents = priceCents;

      const minN = Number.parseInt(editMinNights, 10);
      if (!Number.isFinite(minN) || minN < 1) throw new Error("Min nights must be at least 1.");
      body.min_nights = minN;

      if (editMaxNights.trim()) {
        const maxN = Number.parseInt(editMaxNights, 10);
        if (!Number.isFinite(maxN) || maxN < 1) throw new Error("Max nights must be a positive number.");
        body.max_nights = maxN;
      } else {
        body.max_nights = null;
      }

      const res = await fetch(`/api/admin/listings/${editing.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update listing"));
    },
    onSuccess: () => {
      toast.success("Listing updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-property", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (listing: PropertyListing) => {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete listing"));
    },
    onSuccess: () => {
      toast.success("Listing unlisted");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-property", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(listing: PropertyListing) {
    setEditing(listing);
    setEditUnitType(listing.unit_type ?? "");
    setEditDescription(listing.unit_description ?? "");
    setEditOccupancy(listing.unit_occupancy != null ? String(listing.unit_occupancy) : "");
    setEditBathrooms(listing.unit_bathrooms != null ? String(listing.unit_bathrooms) : "");
    setEditPrice(centsToDollars(listing.base_price_cents));
    setEditCurrency(listing.currency ?? "USD");
    setEditMinNights(String(listing.min_nights ?? 1));
    setEditMaxNights(listing.max_nights != null ? String(listing.max_nights) : "");
    setEditInstantBook(listing.instant_book ?? false);
    setEditIsActive(listing.is_active);
  }

  async function handleDeactivate() {
    try {
      await apiDelete(`/api/admin/properties/${id}`);
      toast.success("Property deactivated");
      await queryClient.invalidateQueries({ queryKey: ["host-properties"] });
      await queryClient.invalidateQueries({ queryKey: ["host-listings"] });
      router.push("/admin/properties");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not deactivate");
    }
  }

  if (propertyQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading property…</p>;
  }

  if (propertyQuery.isError || !p) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/admin/properties">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Properties
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Property not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-2">
        <Link href="/admin/properties">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Properties
        </Link>
      </Button>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                statusColor(p.status, p.is_active),
              )}
              aria-hidden
            />
            <span className="text-sm font-medium text-[#5f6b66]">
              {statusLabel(p.status, p.is_active)}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold text-[#1e6a82] md:text-3xl">
            {p.property_name}
          </h1>
          {location ? (
            <p className="flex items-center gap-1.5 text-sm text-[#5f6b66]">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              {location}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-[#cfd8d3]" asChild>
            <Link href={`/admin/properties/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit property
            </Link>
          </Button>
          <Button className="bg-[#5cbadf] hover:bg-[#49a8cf]" asChild>
            <Link href={`/admin/properties/${id}/listings/new`}>
              <Plus className="mr-2 h-4 w-4" />
              Add listing
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Deactivate
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate this property?</AlertDialogTitle>
                <AlertDialogDescription>
                  This sets the property to inactive and suspended.{" "}
                  {listings.length > 0
                    ? `Its ${listings.length} listing${listings.length === 1 ? "" : "s"} will no longer be visible to guests.`
                    : "You can reactivate it later from the edit form."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDeactivate();
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Deactivate property
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-[#dfe6e1]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="aspect-[16/9] w-full object-cover" />
          </div>

          {p.description ? (
            <Card className="border-[#dfe6e1]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-[#5f6b66]">{p.description}</p>
              </CardContent>
            </Card>
          ) : null}

          {p.list_of_amenities.length > 0 ? (
            <Card className="border-[#dfe6e1]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {p.list_of_amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-[#e8f4fb] px-3 py-1 text-xs font-medium text-[#175566]"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="border-[#dfe6e1]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Slug" value={p.slug} mono />
              <DetailRow
                label="Max guests"
                value={p.max_guests != null ? String(p.max_guests) : "—"}
              />
              <DetailRow label="Timezone" value={p.timezone ?? "—"} />
              <DetailRow label="Instant book" value={p.instant_book ? "Yes" : "No"} />
              <DetailRow
                label="Beds24"
                value={p.beds24_property_id?.trim() || "Not connected"}
              />
              <DetailRow label="Listings" value={String(listings.length)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-[#dfe6e1]">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Listings</CardTitle>
          <Button size="sm" className="bg-[#5cbadf] hover:bg-[#49a8cf]" asChild>
            <Link href={`/admin/properties/${id}/listings/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New listing
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px] pl-6">Listing</TableHead>
                  <TableHead className="hidden sm:table-cell">Occupancy</TableHead>
                  <TableHead>Price / night</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <p>No listings yet.</p>
                      <Button
                        size="sm"
                        className="mt-4 bg-[#d99e64] text-white hover:bg-[#c88a52]"
                        asChild
                      >
                        <Link href={`/admin/properties/${id}/listings/new`}>
                          Create your first listing
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  listings.map((listing) => {
                    const listingThumb = getListingPrimaryPhoto(listing) ?? LISTING_THUMB;
                    const listed = listing.is_active && p.is_active;
                    return (
                      <TableRow
                        key={listing.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/admin/listings/${listing.id}`)}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={listingThumb}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
                            />
                            <div className="min-w-0">
                              <p className="font-medium leading-snug">{listingLabel(listing)}</p>
                              <p className="text-xs text-muted-foreground">{listing.slug}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {listing.unit_occupancy != null
                            ? `${listing.unit_occupancy} guests`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {listing.base_price_cents != null
                            ? formatMoney(listing.base_price_cents, listing.currency ?? "USD")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={listed ? "default" : "outline"}>
                            {listed ? "Listed" : "Unlisted"}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-6" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => router.push(`/admin/listings/${listing.id}`)}
                              >
                                Full editor
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(listing)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(listing)}
                              >
                                Unlist
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
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit listing</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-unit-type">Unit type</Label>
              <Input
                id="edit-unit-type"
                value={editUnitType}
                onChange={(e) => setEditUnitType(e.target.value)}
                placeholder="2 Bedroom Villa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-unit-description">Description</Label>
              <Textarea
                id="edit-unit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-occupancy">Occupancy</Label>
                <Input
                  id="edit-occupancy"
                  type="number"
                  min={0}
                  value={editOccupancy}
                  onChange={(e) => setEditOccupancy(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-bathrooms">Bathrooms</Label>
                <Input
                  id="edit-bathrooms"
                  type="number"
                  min={0}
                  step={0.5}
                  value={editBathrooms}
                  onChange={(e) => setEditBathrooms(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price per night</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-currency">Currency</Label>
                <Input
                  id="edit-currency"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-min-nights">Min nights</Label>
                <Input
                  id="edit-min-nights"
                  type="number"
                  min={1}
                  value={editMinNights}
                  onChange={(e) => setEditMinNights(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-max-nights">Max nights</Label>
                <Input
                  id="edit-max-nights"
                  type="number"
                  min={1}
                  value={editMaxNights}
                  onChange={(e) => setEditMaxNights(e.target.value)}
                  placeholder="No limit"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="edit-listing-instant-book">Instant book</Label>
              </div>
              <Switch
                id="edit-listing-instant-book"
                checked={editInstantBook}
                onCheckedChange={setEditInstantBook}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="edit-listing-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive listings are hidden from guests
                </p>
              </div>
              <Switch
                id="edit-listing-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlist listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{deleting ? listingLabel(deleting) : ""}</strong>. It will
              no longer be bookable but can be reactivated later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => deleting && deleteMutation.mutate(deleting)}
            >
              Unlist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#6b7280]">{label}</span>
      <span
        className={cn(
          "text-right font-medium text-[#222222]",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}
