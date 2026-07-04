import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const itemBodySchema = z.object({
  listing_id: z.string().uuid(),
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id: wishlistId } = await ctx.params;
  const { data, error } = await parseJsonBody(req, itemBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();

  const { data: wishlist, error: wishlistError } = await supabase
    .from("wishlists")
    .select("id")
    .eq("id", wishlistId)
    .eq("guest_id", session.user.id)
    .maybeSingle();
  if (wishlistError) return jsonError(500, wishlistError.message);
  if (!wishlist) return jsonError(404, "Wishlist not found");
  const { data: row, error: insertError } = await supabase
    .from("wishlist_items")
    .upsert(
      {
        wishlist_id: wishlistId,
        listing_id: data.listing_id,
        notes: data.notes ?? null,
      },
      { onConflict: "wishlist_id,listing_id" },
    )
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ item: row }, { status: 201 });
});

const removeBodySchema = z.object({ listing_id: z.string().uuid() });

export const DELETE = requireAuth<Params>(async (req, ctx, session) => {
  const { id: wishlistId } = await ctx.params;
  const { data, error } = await parseJsonBody(req, removeBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();

  const { data: wishlist, error: wishlistError } = await supabase
    .from("wishlists")
    .select("id")
    .eq("id", wishlistId)
    .eq("guest_id", session.user.id)
    .maybeSingle();
  if (wishlistError) return jsonError(500, wishlistError.message);
  if (!wishlist) return jsonError(404, "Wishlist not found");
  const { error: deleteError } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("wishlist_id", wishlistId)
    .eq("listing_id", data.listing_id);
  if (deleteError) return jsonError(400, deleteError.message);
  return Response.json({ ok: true });
});
