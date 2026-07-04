import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { listingWithLegacyPhotoUrl } from "@/lib/listings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

const wishlistBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  is_public: z.boolean().default(false),
});

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wishlists")
    .select(
      "*, wishlist_items(listing_id, added_at, notes, listings(slug, photos_url, roomPhotos_url, unit_type, properties(slug, property_name, city, country)))",
    )
    .eq("guest_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  const wishlists = (data ?? []).map((w) => {
    const row = w as Record<string, unknown>;
    const items = row.wishlist_items as unknown[] | undefined;
    if (!items?.length) return row;
    return {
      ...row,
      wishlist_items: items.map((raw) => {
        const item = raw as Record<string, unknown>;
        const listing = item.listings as Record<string, unknown> | undefined;
        if (!listing) return item;
        return { ...item, listings: listingWithLegacyPhotoUrl(listing) };
      }),
    };
  });
  return Response.json({ wishlists });
});

export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, wishlistBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { data: row, error: insertError } = await supabase
    .from("wishlists")
    .insert({
      guest_id: session.user.id,
      name: data.name,
      is_public: data.is_public,
      share_token: data.is_public ? randomBytes(12).toString("hex") : null,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ wishlist: row }, { status: 201 });
});
