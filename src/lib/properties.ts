import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type PropertyRow = {
  id: string;
  slug: string;
  property_name: string;
  description: string | null;
  photos_url: string[];
  list_of_amenities: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  max_guests: number | null;
  instant_book?: boolean | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Fields safe to return from public GET endpoints (no internal id). */
export type PublicProperty = Omit<PropertyRow, "id">;

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidPropertySlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 120 && SLUG_REGEX.test(slug);
}

export function toPublicProperty(row: PropertyRow): PublicProperty {
  const { id: _omit, ...rest } = row;
  return rest;
}

export function getPropertyPrimaryPhoto(property: {
  photos_url?: string[] | null;
}): string | null {
  return property.photos_url?.find((url) => url.trim().length > 0) ?? null;
}

/** Short location line for cards (city, state, country or address). */
export function formatPropertyLocation(property: {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}): string {
  const line = [property.city, property.state, property.country]
    .filter(Boolean)
    .join(", ");
  if (line) return line;
  if (property.address) return property.address;
  return "Location on request";
}

export async function getPropertyBySlug(
  slug: string,
): Promise<PropertyRow | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PropertyRow | null;
}

export async function getPropertyById(
  id: string,
): Promise<PropertyRow | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PropertyRow | null;
}

/** Active properties for listing pages (alphabetical by name). */
export async function listActiveProperties(): Promise<PublicProperty[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("is_active", true)
    .order("property_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as PropertyRow[]).map(toPublicProperty);
}

export function slugifyFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : "property";
}

export type CreatePropertyInput = {
  property_name: string;
  /** If omitted, derived from property_name and made unique. */
  slug?: string;
  description?: string | null;
  photos_url?: string[];
  list_of_amenities?: string[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  max_guests?: number | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

export async function createProperty(
  input: CreatePropertyInput,
): Promise<{ row: PropertyRow; public: PublicProperty }> {
  const supabase = createSupabaseAdmin();

  let baseSlug: string;
  if (input.slug != null && input.slug.trim() !== "") {
    const requested = input.slug.trim().toLowerCase();
    if (!isValidPropertySlug(requested)) {
      throw new PropertyValidationError(
        "Invalid slug: use lowercase letters, numbers, and single hyphens between segments (max 120 characters).",
      );
    }
    baseSlug = requested.slice(0, 110);
  } else {
    baseSlug = slugifyFromName(input.property_name);
  }

  if (!isValidPropertySlug(baseSlug)) {
    throw new PropertyValidationError(
      "Could not derive a valid slug from property_name; provide slug explicitly.",
    );
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt < 25) {
    const slug =
      attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;

    const insertPayload = {
      slug,
      property_name: input.property_name.trim(),
      description: input.description ?? null,
      photos_url: input.photos_url ?? [],
      list_of_amenities: input.list_of_amenities ?? [],
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      country: input.country ?? null,
      postal_code: input.postal_code ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      max_guests: input.max_guests ?? null,
      is_active: input.is_active ?? true,
      metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase
      .from("properties")
      .insert(insertPayload)
      .select("*")
      .single();

    if (!error && data) {
      const row = data as PropertyRow;
      return { row, public: toPublicProperty(row) };
    }

    lastError = error;
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      attempt += 1;
      continue;
    }
    throw error;
  }

  throw lastError ?? new Error("Could not allocate a unique slug");
}

export class PropertyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropertyValidationError";
  }
}
