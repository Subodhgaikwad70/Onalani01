"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminPhotoUploader,
  type AdminUploadedPhoto,
} from "@/components/admin/admin-photo-uploader";
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
import { ApiError, apiDelete } from "@/lib/api/client";
import { CancellationPolicySelect } from "@/components/admin/cancellation-policy-select";

type PropertyRecord = {
  id: string;
  property_name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  max_guests: number | null;
  timezone: string | null;
  beds24_property_id: string | null;
  status: string;
  instant_book: boolean | null;
  is_active: boolean;
  cancellation_policy_id: string | null;
  list_of_amenities: string[];
  photos_url: string[];
  listings?: Array<{ id: string }>;
};

function urlsToAdminPhotos(urls: string[]): AdminUploadedPhoto[] {
  return urls
    .filter((url) => url.trim().length > 0)
    .map((url) => {
      const name = url.split("/").pop()?.split("?")[0] ?? "photo";
      return { url, path: url, name };
    });
}

function buildPropertyBody(fields: {
  propertyName: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  maxGuests: string;
  timezone: string;
  beds24PropertyId: string;
  status: string;
  instantBook: boolean;
  cancellationPolicyId: string;
  amenities: string[];
  photos: AdminUploadedPhoto[];
  isActive?: boolean;
}) {
  const latParsed = fields.latitude.trim()
    ? Number.parseFloat(fields.latitude)
    : null;
  const lngParsed = fields.longitude.trim()
    ? Number.parseFloat(fields.longitude)
    : null;
  const guestsParsed = fields.maxGuests.trim()
    ? Number.parseInt(fields.maxGuests, 10)
    : null;
  const photoUrls = fields.photos.map((p) => p.url);

  const body: Record<string, unknown> = {
    property_name: fields.propertyName.trim(),
    description: fields.description.trim() || null,
    address: fields.address.trim() || null,
    city: fields.city.trim() || null,
    state: fields.state.trim() || null,
    country: fields.country.trim() || null,
    postal_code: fields.postalCode.trim() || null,
    latitude:
      latParsed != null && Number.isFinite(latParsed) ? latParsed : null,
    longitude:
      lngParsed != null && Number.isFinite(lngParsed) ? lngParsed : null,
    max_guests:
      guestsParsed != null && Number.isFinite(guestsParsed)
        ? guestsParsed
        : null,
    timezone: fields.timezone.trim() || null,
    beds24_property_id: fields.beds24PropertyId.trim() || null,
    status: fields.status,
    instant_book: fields.instantBook,
    cancellation_policy_id: fields.cancellationPolicyId || null,
    list_of_amenities: fields.amenities,
    photos_url: photoUrls,
    photo_url: photoUrls[0] ?? null,
  };

  if (fields.isActive !== undefined) {
    body.is_active = fields.isActive;
  }

  return body;
}

export function PropertyForm({
  mode,
  propertyId,
}: {
  mode: "create" | "edit";
  propertyId?: string;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [propertyName, setPropertyName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [maxGuests, setMaxGuests] = useState("");
  const [timezone, setTimezone] = useState("");
  const [beds24PropertyId, setBeds24PropertyId] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [instantBook, setInstantBook] = useState(false);
  const [cancellationPolicyId, setCancellationPolicyId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [amenitiesText, setAmenitiesText] = useState("");
  const [photos, setPhotos] = useState<AdminUploadedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [listingCount, setListingCount] = useState(0);

  const amenities = useMemo(
    () =>
      amenitiesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [amenitiesText],
  );

  useEffect(() => {
    if (isEdit) return;
    void (async () => {
      try {
        const res = await fetch("/api/cancellation-policies");
        if (!res.ok) return;
        const j = (await res.json()) as {
          policies: Array<{ id: string; key: string }>;
          default_key: string;
        };
        const defaultPolicy =
          j.policies.find((p) => p.key === j.default_key) ?? j.policies[0];
        if (defaultPolicy) {
          setCancellationPolicyId((current) => current || defaultPolicy.id);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !propertyId) return;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/properties/${propertyId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("load");
        const j = (await res.json()) as { property: PropertyRecord };
        const p = j.property;

        setPropertyName(p.property_name ?? "");
        setDescription(p.description ?? "");
        setAddress(p.address ?? "");
        setCity(p.city ?? "");
        setState(p.state ?? "");
        setCountry(p.country ?? "");
        setPostalCode(p.postal_code ?? "");
        setLatitude(p.latitude != null ? String(p.latitude) : "");
        setLongitude(p.longitude != null ? String(p.longitude) : "");
        setMaxGuests(p.max_guests != null ? String(p.max_guests) : "");
        setTimezone(p.timezone ?? "");
        setBeds24PropertyId(p.beds24_property_id ?? "");
        setStatus(p.status ?? "draft");
        setInstantBook(Boolean(p.instant_book));
        setCancellationPolicyId(p.cancellation_policy_id ?? "");
        setIsActive(Boolean(p.is_active));
        setAmenitiesText((p.list_of_amenities ?? []).join(", "));
        setPhotos(urlsToAdminPhotos(p.photos_url ?? []));
        setListingCount(p.listings?.length ?? 0);
      } catch {
        toast.error("Could not load property");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, propertyId]);

  function validate(): string | null {
    if (!propertyName.trim()) return "Property name is required.";
    if (latitude.trim()) {
      const lat = Number.parseFloat(latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90)
        return "Latitude must be between -90 and 90.";
    }
    if (longitude.trim()) {
      const lng = Number.parseFloat(longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180)
        return "Longitude must be between -180 and 180.";
    }
    if (maxGuests.trim()) {
      const v = Number.parseInt(maxGuests, 10);
      if (!Number.isFinite(v) || v < 1)
        return "Max guests must be a positive number.";
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const body = buildPropertyBody({
        propertyName,
        description,
        address,
        city,
        state,
        country,
        postalCode,
        latitude,
        longitude,
        maxGuests,
        timezone,
        beds24PropertyId,
        status,
        instantBook,
        cancellationPolicyId,
        amenities,
        photos,
        isActive: isEdit ? isActive : undefined,
      });

      const url = isEdit
        ? `/api/admin/properties/${propertyId}`
        : "/api/admin/properties";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          (j as { error?: { message?: string } }).error?.message ??
            `Could not ${isEdit ? "save" : "create"} property`,
        );
        return;
      }
      toast.success(isEdit ? "Property saved" : "Property created");
      const id =
        (j as { property?: { id: string } }).property?.id ?? propertyId;
      if (id) {
        router.push(`/admin/properties/${id}`);
      } else {
        router.push("/admin/properties");
      }
      router.refresh();
    } catch {
      toast.error(isEdit ? "Save failed" : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!propertyId) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/properties/${propertyId}`);
      toast.success("Property deactivated");
      router.push("/admin/properties");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not deactivate");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading property…</p>;
  }

  const backHref =
    isEdit && propertyId
      ? `/admin/properties/${propertyId}`
      : "/admin/properties";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 h-auto px-2 py-1 text-[#6b7280]"
          asChild
        >
          <Link href={backHref}>← Back</Link>
        </Button>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b7280]">
          {isEdit ? "Edit property" : "New property"}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-lora)] text-3xl font-semibold text-[#1e6a82]">
          {isEdit ? "Edit property" : "Create property"}
        </h1>
        <p className="mt-2 text-sm text-[#5f6b66]">
          {isEdit
            ? "Update property details. Listings under this property are managed separately."
            : "Fill in the details for your property. You can add listings to it afterwards."}
        </p>
      </div>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-lora)] text-xl text-[#1e6a82]">
            Basic information
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            Name, description, and guest capacity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prop-name">
              Property name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="prop-name"
              placeholder="e.g. Sunset Beach Resort"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              className="border-[#dfe6e1]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prop-desc">Description</Label>
            <Textarea
              id="prop-desc"
              rows={4}
              placeholder="Describe the property, its surroundings, and what makes it special..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-[#dfe6e1]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-guests">Max guests</Label>
              <Input
                id="max-guests"
                inputMode="numeric"
                placeholder="e.g. 12"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="e.g. America/Los_Angeles"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-lora)] text-xl text-[#1e6a82]">
            Location
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            Address and geographic coordinates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address">Street address</Label>
            <Input
              id="address"
              placeholder="e.g. 123 Ocean Drive"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="border-[#dfe6e1]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="e.g. Maui"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input
                id="state"
                placeholder="e.g. Hawaii"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="e.g. United States"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal-code">Postal code</Label>
              <Input
                id="postal-code"
                placeholder="e.g. 96761"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                inputMode="decimal"
                placeholder="e.g. 20.8987"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                inputMode="decimal"
                placeholder="e.g. -156.5083"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-lora)] text-xl text-[#1e6a82]">
            Photos
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            Upload images of the property. Max 10 MB per file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <AdminPhotoUploader
            bucket="property-photos"
            photos={photos}
            onPhotosChange={setPhotos}
            uploading={uploadingPhotos}
            onUploadingChange={setUploadingPhotos}
            disabled={submitting}
          />
        </CardContent>
      </Card>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-lora)] text-xl text-[#1e6a82]">
            Amenities
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            Comma-separated list of amenities available at the property.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amenities">Amenities</Label>
            <Textarea
              id="amenities"
              rows={3}
              placeholder="e.g. Pool, Spa, Gym, Beach Access, Parking, WiFi"
              value={amenitiesText}
              onChange={(e) => setAmenitiesText(e.target.value)}
              className="border-[#dfe6e1]"
            />
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[#e8f4fb] px-3 py-1 text-xs font-medium text-[#175566]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#dfe6e1] shadow-sm">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-lora)] text-xl text-[#1e6a82]">
            Settings
          </CardTitle>
          <CardDescription className="text-[#5f6b66]">
            Visibility, booking preferences, and integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status" className="border-[#dfe6e1]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_review">Pending review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  {isEdit ? (
                    <SelectItem value="suspended">Suspended</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancellation-policy">Cancellation policy</Label>
              <CancellationPolicySelect
                id="cancellation-policy"
                value={cancellationPolicyId}
                onValueChange={setCancellationPolicyId}
              />
              <p className="text-xs text-[#6b7280]">
                Sets the default rate tier for new bookings. Guests can still
                choose any tier at checkout; Firm adds ~7.5%, Non-refundable
                saves 10%.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="beds24">Beds24 Property ID</Label>
              <Input
                id="beds24"
                placeholder="Optional"
                value={beds24PropertyId}
                onChange={(e) => setBeds24PropertyId(e.target.value)}
                className="border-[#dfe6e1]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#eceeec] bg-[#fafcfb] px-4 py-3">
            <div>
              <Label htmlFor="instant-book">Instant book</Label>
              <p className="text-xs text-[#6b7280]">
                Allow guests to book immediately without host approval.
              </p>
            </div>
            <Switch
              id="instant-book"
              checked={instantBook}
              onCheckedChange={setInstantBook}
            />
          </div>
          {isEdit ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#eceeec] bg-[#fafcfb] px-4 py-3">
              <div>
                <Label htmlFor="is-active">Active</Label>
                <p className="text-xs text-[#6b7280]">
                  Inactive properties are hidden from guests.
                </p>
              </div>
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe6e1] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="border-[#cfd8d3]" asChild>
            <Link href={backHref}>Cancel</Link>
          </Button>
          {isEdit && propertyId ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={deleting || submitting}
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
                    {listingCount > 0
                      ? `Its ${listingCount} listing${listingCount === 1 ? "" : "s"} will no longer be visible to guests.`
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
                    disabled={deleting}
                  >
                    {deleting ? "Deactivating…" : "Deactivate property"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || uploadingPhotos}
          className="bg-[#d99e64] text-white hover:bg-[#c88a52]"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEdit ? "Saving…" : "Creating…"}
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Create property"
          )}
        </Button>
      </div>
    </div>
  );
}
