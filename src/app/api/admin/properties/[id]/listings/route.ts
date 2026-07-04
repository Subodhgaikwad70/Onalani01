import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createListingBodySchema } from "@/lib/catalog/schemas";
import {
  allocateUniqueListingSlug,
  slugifyFromName,
} from "@/lib/catalog/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

/** GET /api/admin/properties/{id}/listings */
export const GET = requireAdmin<Params>(
  async (_req, ctx, _session) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("property_id", id)
      .order("created_at", { ascending: false });
    if (error) return jsonError(500, error.message);
    return Response.json({ listings: data ?? [] });
  },
);

/** POST /api/admin/properties/{id}/listings */
export const POST = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, createListingBodySchema);
    if (error) return error;

    if (data.property_id !== id) {
      return jsonError(400, "property_id in body must match URL");
    }

    const baseSlug =
      data.slug ?? slugifyFromName(data.unit_type ?? "unit") ?? "unit";
    const slug = await allocateUniqueListingSlug(baseSlug);
    const photos = data.photos_url?.length
      ? data.photos_url
      : data.photo_url
        ? [data.photo_url]
        : [];

    const supabase = await createSupabaseServerClient();
    const { data: row, error: insertError } = await supabase
      .from("listings")
      .insert({
        slug,
        property_id: data.property_id,
        unit_type: data.unit_type ?? null,
        unit_amenities: data.unit_amenities ?? [],
        unit_occupancy: data.unit_occupancy ?? null,
        unit_bathrooms: data.unit_bathrooms ?? null,
        unit_area: data.unit_area ?? null,
        unit_description: data.unit_description ?? null,
        unit_kitchen_type: data.unit_kitchen_type ?? null,
        photos_url: photos,
        base_price_cents: data.base_price_cents ?? 0,
        currency: data.currency ?? "USD",
        min_nights: data.min_nights ?? 1,
        max_nights: data.max_nights ?? null,
        beds24_room_id: data.beds24_room_id ?? null,
        instant_book: data.instant_book ?? false,
        test_payment_mode: data.test_payment_mode ?? false,
      })
      .select("*")
      .single();

    if (insertError) return jsonError(400, insertError.message);
    return Response.json({ listing: row }, { status: 201 });
  },
);
