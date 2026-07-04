"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiDelete, apiPatch, apiPost, apiPut } from "@/lib/api/client";
import { parseHttpsUrlsLines } from "@/lib/listings";
import { cn } from "@/lib/utils";

type ListingPayload = {
  slug?: string;
  property_id?: string;
  unit_type?: string | null;
  unit_description?: string | null;
  unit_occupancy?: number | null;
  unit_bathrooms?: number | string | null;
  unit_kitchen_type?: string | null;
  photos_url?: string[] | null;
  base_price_cents?: number | null;
  currency?: string | null;
  min_nights?: number | null;
  max_nights?: number | null;
  beds24_room_id?: string | null;
  instant_book?: boolean | null;
  test_payment_mode?: boolean | null;
};

type SectionId = "basics" | "pricing" | "photos" | "calendar" | "fees";

const SECTIONS: {
  id: SectionId;
  label: string;
  description: string;
}[] = [
  {
    id: "basics",
    label: "Listing basics",
    description: "Title, description, guests, and booking preferences.",
  },
  {
    id: "pricing",
    label: "Pricing & nights",
    description: "Base rate and stay-length limits.",
  },
  {
    id: "photos",
    label: "Photos & integrations",
    description: "Gallery URLs and channel IDs.",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Block dates when this unit is unavailable.",
  },
  {
    id: "fees",
    label: "Fees",
    description: "Cleaning, pets, and other line items.",
  },
];

type CalendarBlock = {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
};

type FeeKind = "cleaning" | "extra_guest" | "pet" | "service" | "resort";
type FeeApplies = "stay" | "night" | "guest_night";

type FeeDraft = {
  kind: FeeKind;
  amount_cents: number;
  currency: string;
  applies_per: FeeApplies;
  threshold: number | null;
};

export function AdminListingEditor({ listingId }: { listingId: string }) {
  const [section, setSection] = useState<SectionId>("basics");

  const [slug, setSlug] = useState("");
  const [propertyId, setPropertyId] = useState("");

  const [unitType, setUnitType] = useState("");
  const [description, setDescription] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [kitchenType, setKitchenType] = useState("");
  const [instantBook, setInstantBook] = useState(false);
  const [testPaymentMode, setTestPaymentMode] = useState(false);

  const [basePrice, setBasePrice] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [minNights, setMinNights] = useState("1");
  const [maxNights, setMaxNights] = useState("");

  const [photoUrlsText, setPhotoUrlsText] = useState("");
  const [beds24RoomId, setBeds24RoomId] = useState("");

  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newReason, setNewReason] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);

  const [feeRows, setFeeRows] = useState<FeeDraft[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesSaving, setFeesSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      const res = await fetch(
        `/api/admin/listings/${listingId}/calendar/blocks`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("load blocks");
      const j = (await res.json()) as { blocks: CalendarBlock[] };
      setBlocks(Array.isArray(j.blocks) ? j.blocks : []);
    } catch {
      toast.error("Could not load calendar blocks");
    } finally {
      setBlocksLoading(false);
    }
  }, [listingId]);

  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/fees`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("load fees");
      const j = (await res.json()) as {
        fees: Array<{
          kind: FeeKind;
          amount_cents: number;
          currency: string;
          applies_per: FeeApplies;
          threshold?: number | null;
        }>;
      };
      const rows = (j.fees ?? []).map((f) => ({
        kind: f.kind,
        amount_cents: f.amount_cents,
        currency: (f.currency ?? "USD").slice(0, 3).toUpperCase(),
        applies_per: f.applies_per ?? "stay",
        threshold:
          f.threshold != null && Number.isFinite(f.threshold)
            ? f.threshold
            : null,
      }));
      setFeeRows(rows);
    } catch {
      toast.error("Could not load fees");
    } finally {
      setFeesLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/listings/${listingId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("load");
        const j = await res.json();
        const l = j.listing as ListingPayload;

        setSlug(l.slug ?? "");
        setPropertyId(l.property_id ?? "");

        setUnitType(l.unit_type ?? "");
        setDescription(l.unit_description ?? "");
        setOccupancy(l.unit_occupancy != null ? String(l.unit_occupancy) : "");
        setBathrooms(
          l.unit_bathrooms != null ? String(l.unit_bathrooms) : "",
        );
        setKitchenType(l.unit_kitchen_type ?? "");
        setInstantBook(Boolean(l.instant_book));

        setBasePrice(String(l.base_price_cents ?? 0));
        setCurrency((l.currency ?? "USD").slice(0, 3));
        setMinNights(String(l.min_nights ?? 1));
        setMaxNights(l.max_nights != null ? String(l.max_nights) : "");

        const urls = Array.isArray(l.photos_url)
          ? l.photos_url.filter(Boolean)
          : [];
        setPhotoUrlsText(urls.join("\n"));
        setBeds24RoomId(l.beds24_room_id ?? "");
        setTestPaymentMode(Boolean(l.test_payment_mode));
      } catch {
        toast.error("Could not load listing");
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  function goToSection(next: SectionId) {
    setSection(next);
    if (next === "calendar") void loadBlocks();
    if (next === "fees") void loadFees();
  }

  async function saveListing() {
    if (occupancy.trim()) {
      const v = Number.parseInt(occupancy, 10);
      if (!Number.isFinite(v) || v < 1) {
        toast.error("Max guests must be a positive number.");
        return;
      }
    }
    if (bathrooms.trim()) {
      const v = Number.parseFloat(bathrooms);
      if (!Number.isFinite(v) || v < 0) {
        toast.error("Bathrooms must be a valid number.");
        return;
      }
    }
    const min = Number.parseInt(minNights, 10);
    if (!Number.isFinite(min) || min < 1) {
      toast.error("Minimum nights must be at least 1.");
      return;
    }
    if (maxNights.trim()) {
      const max = Number.parseInt(maxNights, 10);
      if (!Number.isFinite(max) || max < min) {
        toast.error("Maximum nights must be empty or ≥ minimum nights.");
        return;
      }
    }

    const invalidPhotoLines = photoUrlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((line) => {
        try {
          const u = new URL(line);
          return u.protocol !== "http:" && u.protocol !== "https:";
        } catch {
          return true;
        }
      });
    if (invalidPhotoLines.length > 0) {
      toast.error("Photo URLs must be valid http(s) links, one per line.");
      return;
    }

    const occParsed = occupancy.trim() ? Number.parseInt(occupancy, 10) : NaN;
    const bathParsed = bathrooms.trim() ? Number.parseFloat(bathrooms) : NaN;
    const maxRaw = maxNights.trim();
    const maxParsed = maxRaw ? Number.parseInt(maxRaw, 10) : NaN;
    const photos = parseHttpsUrlsLines(photoUrlsText);

    setSaving(true);
    try {
      await apiPatch(`/api/admin/listings/${listingId}`, {
        unit_type: unitType.trim() || null,
        unit_description: description.trim() || null,
        unit_occupancy: Number.isFinite(occParsed) ? occParsed : null,
        unit_bathrooms: Number.isFinite(bathParsed) ? bathParsed : null,
        unit_kitchen_type: kitchenType.trim() || null,
        instant_book: instantBook,
        base_price_cents: Number(basePrice) || 0,
        currency: (currency || "USD").slice(0, 3).toUpperCase(),
        min_nights: min,
        max_nights: Number.isFinite(maxParsed) ? maxParsed : null,
        beds24_room_id: beds24RoomId.trim() || null,
        photos_url: photos,
        test_payment_mode: testPaymentMode,
      });
      toast.success("Listing updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addBlock() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newStart) || !/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) {
      toast.error("Use YYYY-MM-DD for start and end dates.");
      return;
    }
    if (newEnd < newStart) {
      toast.error("End date must be on or after start.");
      return;
    }
    setBlockSaving(true);
    try {
      await apiPost(`/api/admin/listings/${listingId}/calendar/blocks`, {
        starts_on: newStart,
        ends_on: newEnd,
        reason: newReason.trim() || null,
      });
      toast.success("Block added");
      setNewReason("");
      await loadBlocks();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add block");
    } finally {
      setBlockSaving(false);
    }
  }

  async function removeBlock(blockId: string) {
    try {
      await apiDelete(`/api/admin/listings/${listingId}/calendar/blocks/${blockId}`);
      toast.success("Block removed");
      await loadBlocks();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove block");
    }
  }

  async function saveFees() {
    for (const row of feeRows) {
      if (!Number.isFinite(row.amount_cents) || row.amount_cents < 0) {
        toast.error("Each fee needs a non-negative amount (cents).");
        return;
      }
      if (!/^[A-Z]{3}$/.test(row.currency)) {
        toast.error("Use a 3-letter currency code (e.g. USD).");
        return;
      }
    }
    setFeesSaving(true);
    try {
      await apiPut(`/api/admin/listings/${listingId}/fees`, {
        fees: feeRows.map((f) => ({
          kind: f.kind,
          amount_cents: Math.round(f.amount_cents),
          currency: f.currency,
          applies_per: f.applies_per,
          threshold: f.threshold,
        })),
      });
      toast.success("Fees saved");
      await loadFees();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save fees");
    } finally {
      setFeesSaving(false);
    }
  }

  function addFeeRow() {
    setFeeRows((prev) => [
      ...prev,
      {
        kind: "cleaning",
        amount_cents: 0,
        currency: currency.slice(0, 3).toUpperCase() || "USD",
        applies_per: "stay",
        threshold: null,
      },
    ]);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const backHref = propertyId ? `/admin/properties/${propertyId}` : "/admin/properties";
  const activeMeta = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="">
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="font-(family-name:--font-lora) text-2xl">
            Edit listing
          </CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Slug:</span>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{slug}</code>
            </div>
            {slug ? (
              <Link
                href={`/listings/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                View public listing
              </Link>
            ) : null}
          </div>
          <CardDescription>
            Choose a section on the left. Save listing applies basics, pricing, and photos;
            calendar blocks and fees save from their own panels.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row md:min-h-[min(520px,70vh)]">
            <nav
              aria-label="Listing sections"
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-3 md:w-[220px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-4"
            >
              {SECTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(item.id)}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    section === item.id
                      ? "bg-[#e8f4fb] font-medium text-[#1e6a82]"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                  aria-current={section === item.id ? "page" : undefined}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1 p-5 md:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">
                  {activeMeta.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeMeta.description}
                </p>
              </div>

              {section === "basics" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit-type">Unit type</Label>
                    <Input
                      id="unit-type"
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea
                      id="desc"
                      rows={6}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="occupancy">Max guests</Label>
                      <Input
                        id="occupancy"
                        inputMode="numeric"
                        placeholder="e.g. 4"
                        value={occupancy}
                        onChange={(e) => setOccupancy(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bathrooms">Bathrooms</Label>
                      <Input
                        id="bathrooms"
                        inputMode="decimal"
                        placeholder="e.g. 1.5"
                        value={bathrooms}
                        onChange={(e) => setBathrooms(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kitchen">Kitchen</Label>
                    <Input
                      id="kitchen"
                      placeholder="e.g. Full kitchen"
                      value={kitchenType}
                      onChange={(e) => setKitchenType(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div>
                      <Label htmlFor="instant-book">Instant book</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Guests can book immediately when the property also allows it.
                      </p>
                    </div>
                    <Switch
                      id="instant-book"
                      checked={instantBook}
                      onCheckedChange={setInstantBook}
                    />
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="test-payment-mode">Test payment mode</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Skip Stripe and confirm bookings directly for this listing.
                        </p>
                      </div>
                      <Switch
                        id="test-payment-mode"
                        checked={testPaymentMode}
                        onCheckedChange={setTestPaymentMode}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {section === "pricing" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="price-cents">Base price (cents / night)</Label>
                      <Input
                        id="price-cents"
                        type="number"
                        min={0}
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Example: 9500 = $95.00 before taxes and fees.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        maxLength={3}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-nights">Minimum nights</Label>
                      <Input
                        id="min-nights"
                        inputMode="numeric"
                        min={1}
                        value={minNights}
                        onChange={(e) => setMinNights(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="max-nights">Maximum nights (optional)</Label>
                      <Input
                        id="max-nights"
                        inputMode="numeric"
                        placeholder="Leave blank for no limit"
                        value={maxNights}
                        onChange={(e) => setMaxNights(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {section === "photos" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="photos-urls">Photo URLs</Label>
                    <Textarea
                      id="photos-urls"
                      rows={8}
                      placeholder="https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
                      value={photoUrlsText}
                      onChange={(e) => setPhotoUrlsText(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      One HTTPS URL per line.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beds24">Beds24 room ID</Label>
                    <Input
                      id="beds24"
                      value={beds24RoomId}
                      onChange={(e) => setBeds24RoomId(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              ) : null}

              {section === "calendar" ? (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border p-4">
                    <p className="mb-3 text-sm font-medium">Add unavailable range</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="block-start">Start</Label>
                        <Input
                          id="block-start"
                          type="date"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="block-end">End</Label>
                        <Input
                          id="block-end"
                          type="date"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                        <Label htmlFor="block-reason">Reason (optional)</Label>
                        <Input
                          id="block-reason"
                          value={newReason}
                          onChange={(e) => setNewReason(e.target.value)}
                          placeholder="Maintenance, owner stay…"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={() => void addBlock()}
                      disabled={blockSaving}
                    >
                      {blockSaving ? "Adding…" : "Add block"}
                    </Button>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Current blocks</p>
                    {blocksLoading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : blocks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No blocks yet. Guests can book any open night according to your rules.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {blocks.map((b) => (
                          <li
                            key={b.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                          >
                            <span>
                              <span className="font-medium tabular-nums">
                                {b.starts_on}
                              </span>
                              {" → "}
                              <span className="font-medium tabular-nums">
                                {b.ends_on}
                              </span>
                              {b.reason ? (
                                <span className="mt-1 block text-muted-foreground">
                                  {b.reason}
                                </span>
                              ) : null}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void removeBlock(b.id)}
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              {section === "fees" ? (
                <div className="space-y-4">
                  {feesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {feeRows.map((row, i) => (
                          <div
                            key={`${row.kind}-${i}`}
                            className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
                          >
                            <div className="space-y-2 lg:col-span-2">
                              <Label>Kind</Label>
                              <Select
                                value={row.kind}
                                onValueChange={(v) =>
                                  setFeeRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, kind: v as FeeKind } : r,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cleaning">Cleaning</SelectItem>
                                  <SelectItem value="extra_guest">Extra guest</SelectItem>
                                  <SelectItem value="pet">Pet</SelectItem>
                                  <SelectItem value="service">Service</SelectItem>
                                  <SelectItem value="resort">Resort</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Amount (¢)</Label>
                              <Input
                                type="number"
                                min={0}
                                value={row.amount_cents}
                                onChange={(e) =>
                                  setFeeRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            amount_cents: Number(e.target.value) || 0,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Currency</Label>
                              <Input
                                maxLength={3}
                                value={row.currency}
                                onChange={(e) =>
                                  setFeeRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            currency: e.target.value
                                              .toUpperCase()
                                              .slice(0, 3),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Applies</Label>
                              <Select
                                value={row.applies_per}
                                onValueChange={(v) =>
                                  setFeeRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, applies_per: v as FeeApplies }
                                        : r,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stay">Per stay</SelectItem>
                                  <SelectItem value="night">Per night</SelectItem>
                                  <SelectItem value="guest_night">
                                    Per guest-night
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2 lg:flex-col">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() =>
                                  setFeeRows((prev) => prev.filter((_, j) => j !== i))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={addFeeRow}>
                          Add fee
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void saveFees()}
                          disabled={feesSaving}
                        >
                          {feesSaving ? "Saving…" : "Save fees"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {section !== "calendar" && section !== "fees" ? (
                <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
                  <Button onClick={() => void saveListing()} disabled={saving}>
                    {saving ? "Saving…" : "Save listing"}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={backHref}>Back</Link>
                  </Button>
                </div>
              ) : (
                <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
                  <Button variant="outline" asChild>
                    <Link href={backHref}>Back</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
