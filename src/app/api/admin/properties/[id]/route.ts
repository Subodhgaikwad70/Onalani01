import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { updatePropertyBodySchema } from "@/lib/catalog/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

export const GET = requireAdmin<Params>(
  async (_req, ctx, _session) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("properties")
      .select("*, listings(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonError(500, error.message);
    if (!data) return jsonError(404, "Property not found");
    return Response.json({ property: data });
  },
);

export const PATCH = requireAdmin<Params>(
  async (req, ctx, _session) => {
    const { id } = await ctx.params;
    const { data, error } = await parseJsonBody(req, updatePropertyBodySchema);
    if (error) return error;

    const supabase = await createSupabaseServerClient();
    const updates: Record<string, unknown> = { ...data };
    delete (updates as Record<string, unknown>).slug;

    if (Array.isArray(updates.photos_url)) {
      const photos = updates.photos_url as string[];
      updates.photo_url = photos[0] ?? null;
    }

    const { data: row, error: updateError } = await supabase
      .from("properties")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) return jsonError(400, updateError.message);
    return Response.json({ property: row });
  },
);

export const DELETE = requireAdmin<Params>(
  async (_req, ctx, _session) => {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    // Soft-delete by setting is_active=false; physical delete only if no listings exist.
    const { error } = await supabase
      .from("properties")
      .update({ is_active: false, status: "suspended" })
      .eq("id", id);
    if (error) return jsonError(400, error.message);
    return Response.json({ ok: true });
  },
);
