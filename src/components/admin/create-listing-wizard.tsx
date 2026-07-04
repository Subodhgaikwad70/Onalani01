"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdminPhotoUploader,
  type AdminUploadedPhoto,
} from "@/components/admin/admin-photo-uploader";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getCancellationPolicyDisplay } from "@/lib/bookings/cancellation-policies";

const STEPS = ["Unit", "Pricing", "Photos", "Review"] as const;

function dollarsToCents(dollars: string): number | null {
  const n = Number.parseFloat(dollars.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CreateListingWizard({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [unitType, setUnitType] = useState("");
  const [description, setDescription] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [kitchenType, setKitchenType] = useState("");
  const [instantBook, setInstantBook] = useState(false);

  const [pricePerNight, setPricePerNight] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [minNights, setMinNights] = useState("1");
  const [maxNights, setMaxNights] = useState("");

  const [photos, setPhotos] = useState<AdminUploadedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [beds24RoomId, setBeds24RoomId] = useState("");
  const [testPaymentMode, setTestPaymentMode] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const { data: propertyData, isPending: propertyLoading, isError } = useQuery({
    queryKey: ["host-property", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/properties/${propertyId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("property");
      return res.json() as Promise<{
        property: {
          property_name: string;
          id: string;
          cancellation_policy_id?: string | null;
        };
      }>;
    },
    retry: false,
  });

  const propertyName = propertyData?.property.property_name ?? "Property";

  const { data: policyOptions } = useQuery({
    queryKey: ["cancellation-policies"],
    queryFn: async () => {
      const res = await fetch("/api/cancellation-policies");
      if (!res.ok) throw new Error("policies");
      return res.json() as Promise<{
        policies: Array<{ id: string; key: string; label: string }>;
      }>;
    },
  });

  const propertyPolicyKey =
    policyOptions?.policies.find(
      (p) => p.id === propertyData?.property.cancellation_policy_id,
    )?.key ?? null;
  const propertyPolicyLabel =
    getCancellationPolicyDisplay(propertyPolicyKey).label;

  const photoUrls = useMemo(() => photos.map((p) => p.url), [photos]);

  const priceCents = useMemo(() => dollarsToCents(pricePerNight.trim()), [pricePerNight]);

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!unitType.trim()) return "Enter a name or unit type (e.g. “2 Bedroom Villa”).";
      if (occupancy.trim()) {
        const v = Number.parseInt(occupancy, 10);
        if (!Number.isFinite(v) || v < 1) return "Max guests must be a positive number.";
      }
      if (bathrooms.trim()) {
        const v = Number.parseFloat(bathrooms);
        if (!Number.isFinite(v) || v < 0) return "Bathrooms must be a valid number.";
      }
      return null;
    }
    if (index === 1) {
      if (priceCents === null) return "Enter a valid nightly price (0 or greater).";
      const min = Number.parseInt(minNights, 10);
      if (!Number.isFinite(min) || min < 1) return "Minimum nights must be at least 1.";
      if (maxNights.trim()) {
        const max = Number.parseInt(maxNights, 10);
        if (!Number.isFinite(max) || max < min) {
          return "Maximum nights must be empty or greater than minimum nights.";
        }
      }
      return null;
    }
    if (index === 2) {
      if (uploadingPhotos) return "Wait for photo uploads to finish.";
      return null;
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const err = validateStep(0) ?? validateStep(1) ?? validateStep(2);
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const min = Number.parseInt(minNights, 10) || 1;
      const maxRaw = maxNights.trim();
      const max = maxRaw ? Number.parseInt(maxRaw, 10) : null;

      const occParsed = occupancy.trim() ? Number.parseInt(occupancy, 10) : NaN;
      const bathParsed = bathrooms.trim() ? Number.parseFloat(bathrooms) : NaN;

      const body = {
        property_id: propertyId,
        unit_type: unitType.trim(),
        unit_description: description.trim() || null,
        unit_occupancy: Number.isFinite(occParsed) ? occParsed : null,
        unit_bathrooms: Number.isFinite(bathParsed) ? bathParsed : null,
        unit_kitchen_type: kitchenType.trim() || null,
        photos_url: photoUrls.length ? photoUrls : undefined,
        base_price_cents: priceCents ?? 0,
        currency: (currency || "USD").trim().toUpperCase().slice(0, 3) || "USD",
        min_nights: min,
        max_nights: max != null && Number.isFinite(max) ? max : null,
        beds24_room_id: beds24RoomId.trim() || null,
        instant_book: instantBook,
        test_payment_mode: testPaymentMode,
      };

      const res = await fetch(`/api/admin/properties/${propertyId}/listings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((j as { error?: { message?: string } }).error?.message ?? "Could not create listing");
        return;
      }
      const listingId = (j as { listing?: { id: string } }).listing?.id;
      toast.success("Listing created");
      if (listingId) {
        router.push(`/admin/listings/${listingId}`);
        router.refresh();
      } else {
        router.push(`/admin/properties/${propertyId}`);
        router.refresh();
      }
    } catch {
      toast.error("Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (propertyLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 rounded-md bg-muted" />
        <div className="h-48 rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-12 text-center">
        <p className="text-sm text-[#5f6b66]">
          This property could not be loaded or you don&apos;t have access.
        </p>
        <Button variant="outline" className="mt-4 border-[#cfd8d3]" asChild>
          <Link href="/admin/properties">Back to properties</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-auto px-2 py-1 text-[#6b7280]" asChild>
          <Link href={`/admin/properties/${propertyId}`}>← Back to property</Link>
        </Button>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">
          New listing
        </p>
        <h1 className="mt-1 font-(family-name:--font-lora) text-3xl font-semibold text-[#1e6a82]">
          {propertyName}
        </h1>
        <p className="mt-2 text-sm text-[#5f6b66]">
          A short wizard collects what guests see first. You can refine photos, fees, and calendar later in the editor.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => {
                if (i <= step) setStep(i);
              }}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold transition",
                i === step
                  ? "bg-[#5cbadf] text-white shadow-sm"
                  : i < step
                    ? "bg-[#e8f4fb] text-[#175566] ring-1 ring-[#6ba8c4]/30"
                    : "bg-[#f4f6f5] text-[#9ca3af]",
              )}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-(family-name:--font-lora) text-xl text-[#1e6a82]">
            {STEPS[step]}
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            {step === 0 && "What kind of space is this, and how many guests can stay?"}
            {step === 1 && "Set your base nightly rate and stay-length rules."}
            {step === 2 && "Upload listing photos (optional). Max 10 MB per file."}
            {step === 3 && "Confirm and publish the listing shell—you can edit everything afterwards."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="unit-type">Listing title / unit type</Label>
                <Input
                  id="unit-type"
                  placeholder="e.g. Ocean-view studio · Garden cottage"
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  className="border-[#dfe6e1]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-desc">Description</Label>
                <Textarea
                  id="unit-desc"
                  rows={5}
                  placeholder="Highlight what makes this unit special…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border-[#dfe6e1]"
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
                    className="border-[#dfe6e1]"
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
                    className="border-[#dfe6e1]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kitchen">Kitchen</Label>
                <Input
                  id="kitchen"
                  placeholder="e.g. Full kitchen, Kitchenette"
                  value={kitchenType}
                  onChange={(e) => setKitchenType(e.target.value)}
                  className="border-[#dfe6e1]"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#eceeec] bg-[#fafcfb] px-4 py-3">
                <div>
                  <Label htmlFor="instant-book">Instant book</Label>
                  <p className="text-xs text-[#6b7280]">
                    Guests can book immediately when both property and listing allow it.
                  </p>
                </div>
                <Switch id="instant-book" checked={instantBook} onCheckedChange={setInstantBook} />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="price">Nightly price ({currency})</Label>
                  <Input
                    id="price"
                    inputMode="decimal"
                    placeholder="e.g. 189.00"
                    value={pricePerNight}
                    onChange={(e) => setPricePerNight(e.target.value)}
                    className="border-[#dfe6e1]"
                  />
                  {priceCents != null ? (
                    <p className="text-xs text-[#6b7280]">
                      Stored as {(priceCents / 100).toFixed(2)} {currency.toUpperCase()} per night before taxes & fees.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency code</Label>
                  <Input
                    id="currency"
                    maxLength={3}
                    placeholder="USD"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="border-[#dfe6e1]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-nights">Minimum nights</Label>
                  <Input
                    id="min-nights"
                    inputMode="numeric"
                    value={minNights}
                    onChange={(e) => setMinNights(e.target.value)}
                    className="border-[#dfe6e1]"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="max-nights">Maximum nights (optional)</Label>
                  <Input
                    id="max-nights"
                    inputMode="numeric"
                    placeholder="Leave blank for no upper limit"
                    value={maxNights}
                    onChange={(e) => setMaxNights(e.target.value)}
                    className="border-[#dfe6e1]"
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <AdminPhotoUploader
                bucket="listing-photos"
                photos={photos}
                onPhotosChange={setPhotos}
                uploading={uploadingPhotos}
                onUploadingChange={setUploadingPhotos}
                disabled={submitting}
              />
              {photos.length > 0 ? (
                <p className="text-xs text-[#6b7280]">
                  {photos.length} photo{photos.length === 1 ? "" : "s"} ready — URLs
                  will be saved on the listing.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="beds24">Beds24 room ID (optional)</Label>
                <Input
                  id="beds24"
                  value={beds24RoomId}
                  onChange={(e) => setBeds24RoomId(e.target.value)}
                  className="border-[#dfe6e1]"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#fef3c7] bg-[#fffbeb] px-4 py-3">
                <div>
                  <Label htmlFor="test-pay">Test payment mode</Label>
                  <p className="text-xs text-[#92400e]">
                    For development only: skip Stripe on instant bookings for this listing.
                  </p>
                </div>
                <Switch id="test-pay" checked={testPaymentMode} onCheckedChange={setTestPaymentMode} />
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-[#eceeec] bg-[#fafcfb] p-4">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Unit</dt>
                <dd className="mt-1 font-medium text-[#1f2937]">{unitType.trim() || "—"}</dd>
                <dd className="mt-2 whitespace-pre-wrap text-[#5f6b66]">
                  {description.trim() || "No description yet."}
                </dd>
              </div>
              <div className="rounded-xl border border-[#eceeec] bg-[#fafcfb] p-4">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Guests & book</dt>
                <dd className="mt-1 text-[#374151]">
                  Max guests: {occupancy.trim() || "—"} · Baths: {bathrooms.trim() || "—"}
                </dd>
                <dd className="mt-2 text-[#374151]">
                  Instant book: {instantBook ? "On" : "Off"}
                </dd>
                <dd className="mt-2 text-[#374151]">
                  Test payments: {testPaymentMode ? "On" : "Off"}
                </dd>
                <dd className="mt-2 text-[#374151]">
                  Cancellation policy: {propertyPolicyLabel} (set on property)
                </dd>
              </div>
              <div className="rounded-xl border border-[#eceeec] bg-[#fafcfb] p-4 sm:col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Pricing</dt>
                <dd className="mt-1 font-semibold text-[#1e6a82]">
                  {pricePerNight.trim() ? `${pricePerNight.trim()} ${currency.toUpperCase()} / night` : "—"}
                  {priceCents != null ? (
                    <span className="ml-2 font-normal text-[#6b7280]">
                      ({priceCents.toLocaleString()} cents)
                    </span>
                  ) : null}
                </dd>
                <dd className="mt-2 text-[#5f6b66]">
                  Min {minNights} night{minNights === "1" ? "" : "s"}
                  {maxNights.trim() ? ` · Max ${maxNights} nights` : ""}
                </dd>
              </div>
              <div className="rounded-xl border border-[#eceeec] bg-[#fafcfb] p-4 sm:col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Photos</dt>
                <dd className="mt-1 text-[#374151]">
                  {photoUrls.length === 0
                    ? "None added yet."
                    : `${photoUrls.length} photo${photoUrls.length === 1 ? "" : "s"}`}
                </dd>
                {photos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((photo) => (
                      <div
                        key={photo.path}
                        className="overflow-hidden rounded-lg border border-[#dfe6e1]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </dl>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eceeec] pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={step === 0 || submitting || uploadingPhotos}
              className="border-[#cfd8d3]"
            >
              Back
            </Button>
            <div className="flex gap-2">
              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={uploadingPhotos}
                  className="bg-[#5cbadf] hover:bg-[#49a8cf]"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={submitting || uploadingPhotos}
                  className="bg-[#d99e64] text-white hover:bg-[#c88a52]"
                >
                  {submitting ? "Creating…" : "Create listing"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
