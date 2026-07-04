import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createPropertyBodySchema } from "@/lib/catalog/schemas";
import {
  allocateUniquePropertySlug,
  err,
  slugifyFromName,
} from "@/lib/catalog/helpers";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/admin/properties — list all platform properties. */
export const GET = requireAdmin(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return jsonError(500, error.message);
  return Response.json({ properties: data ?? [] });
});

/** POST /api/admin/properties — create a new property. */
export const POST = requireAdmin(async (req) => {
  const { data, error } = await parseJsonBody(req, createPropertyBodySchema);
  if (error) return error;

  const baseSlug = data.slug ?? slugifyFromName(data.property_name);
  const slug = await allocateUniquePropertySlug(baseSlug);

  const supabase = await createSupabaseServerClient();
  const photosUrl = data.photos_url ?? [];
  const singlePhotoUrl = data.photo_url ?? (photosUrl[0] ?? null);

  const { data: row, error: insertError } = await supabase
    .from("properties")
    .insert({
      slug,
      property_name: data.property_name.trim(),
      description: data.description ?? null,
      photo_url: singlePhotoUrl,
      photos_url: photosUrl,
      list_of_amenities: data.list_of_amenities ?? [],
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      country: data.country ?? null,
      postal_code: data.postal_code ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      max_guests: data.max_guests ?? null,
      timezone: data.timezone ?? null,
      beds24_property_id: data.beds24_property_id ?? null,
      instant_book: data.instant_book ?? false,
      status: data.status ?? "draft",
      cancellation_policy_id: data.cancellation_policy_id ?? undefined,
    })
    .select("*")
    .single();

  if (insertError) return err(400, insertError.message);
  return Response.json({ property: row }, { status: 201 });
});
