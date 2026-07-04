import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { type PropertyRow } from "@/lib/properties";

/** Matches `public.listings` (Unit_* fields stored as unit_*). */
export type ListingRow = {
  id: string;
  slug: string;
  property_id: string;
  unit_type: string | null;
  unit_amenities: string[];
  unit_occupancy: number | null;
  /** PostgREST may return string for numeric columns */
  unit_bathrooms: number | string | null;
  unit_area: number | string | null;
  unit_description: string | null;
  unit_kitchen_type: string | null;
  photos_url: string[];
  roomPhotos_url: string[];
  is_active: boolean;
  instant_book?: boolean | null;
  base_price_cents?: number | null;
  currency?: string | null;
  /** Beds24 room type id for calendar / availability sync */
  beds24_room_id?: string | null;
  min_nights?: number | null;
  max_nights?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PublicListing = Omit<ListingRow, "id">;
export type ListingWithProperty = ListingRow & {
  properties: PropertyRow | null;
};

export function toPublicListing(row: ListingRow): PublicListing {
  const { id: _omit, ...rest } = row;
  return rest;
}

export function getListingPrimaryPhoto(listing: {
  photos_url?: string[] | null;
  roomPhotos_url?: string[] | null;
}): string | null {
  return (
    listing.photos_url?.find((url) => url.trim().length > 0) ??
    listing.roomPhotos_url?.find((url) => url.trim().length > 0) ??
    null
  );
}

/** Parse HTTPS image URLs from a textarea (one URL per line). */
export function parseHttpsUrlsLines(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    try {
      const u = new URL(line);
      if (u.protocol === "http:" || u.protocol === "https:") {
        out.push(u.toString());
      }
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

/** Legacy JSON shape: expose a single `photo_url` cover from column or URL arrays. */
export function listingWithLegacyPhotoUrl(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const fromColumn =
    typeof row.photo_url === "string" && row.photo_url.trim().length > 0
      ? row.photo_url.trim()
      : null;
  const photo_url =
    fromColumn ??
    getListingPrimaryPhoto({
      photos_url: row.photos_url as string[] | undefined,
      roomPhotos_url: row.roomPhotos_url as string[] | undefined,
    });
  const { photos_url: _p, roomPhotos_url: _r, photo_url: _omit, ...rest } = row;
  return { ...rest, photo_url };
}

export async function getListingBySlug(
  slug: string,
): Promise<ListingRow | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ListingRow | null;
}

export async function listListingsByPropertyId(
  propertyId: string,
): Promise<ListingRow[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data as ListingRow[];
}

export async function listActiveListingsWithProperties(): Promise<
  ListingWithProperty[]
> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("listings")
    .select("*, properties!inner(*)")
    .eq("is_active", true)
    .eq("properties.is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data as ListingWithProperty[];
}
