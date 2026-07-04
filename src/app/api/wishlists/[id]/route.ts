import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const wishlistPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_public: z.boolean().optional(),
});

/** PATCH /api/wishlists/{id} */
export const PATCH = requireAuth<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, wishlistPatchSchema);
  if (error) return error;
  if (Object.keys(data).length === 0) {
    return jsonError(400, "No fields provided");
  }

  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.is_public !== undefined) {
    patch.is_public = data.is_public;
    patch.share_token = data.is_public ? randomBytes(12).toString("hex") : null;
  }

  const { data: row, error: updateError } = await supabase
    .from("wishlists")
    .update(patch)
    .eq("id", id)
    .eq("guest_id", session.user.id)
    .select("*")
    .maybeSingle();

  if (updateError) return jsonError(400, updateError.message);
  if (!row) return jsonError(404, "Wishlist not found");
  return Response.json({ wishlist: row });
});

