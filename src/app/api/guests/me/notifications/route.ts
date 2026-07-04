import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const markReadBodySchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
});

const patchNotificationBodySchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    read: z.boolean().optional(),
    important: z.boolean().optional(),
  })
  .refine((d) => d.read !== undefined || d.important !== undefined, {
    message: "Provide read and/or important",
  });

const deleteBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const GET = requireAuth(async (req, _ctx, session) => {
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  return Response.json({ notifications: data ?? [] });
});

export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, markReadBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", session.user.id)
    .is("read_at", null);
  if (data.ids) query = query.in("id", data.ids);
  const { error: updateError } = await query;
  if (updateError) return jsonError(400, updateError.message);
  return Response.json({ ok: true });
});

export const PATCH = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, patchNotificationBodySchema);
  if (error) return error;
  const updates: { read_at?: string | null; is_important?: boolean } = {};
  if (data.read !== undefined) {
    updates.read_at = data.read ? new Date().toISOString() : null;
  }
  if (data.important !== undefined) {
    updates.is_important = data.important;
  }
  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase
    .from("notifications")
    .update(updates)
    .eq("recipient_id", session.user.id)
    .in("id", data.ids);
  if (updateError) return jsonError(400, updateError.message);
  return Response.json({ ok: true });
});

export const DELETE = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, deleteBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase
    .from("notifications")
    .delete()
    .eq("recipient_id", session.user.id)
    .in("id", data.ids);
  if (deleteError) return jsonError(400, deleteError.message);
  return Response.json({ ok: true });
});
