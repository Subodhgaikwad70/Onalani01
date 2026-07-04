import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import {
  MAX_SAVED_SEARCHES,
  savedSearchBodySchema,
  stableJson,
} from "@/lib/saved-searches/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("profile_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  return Response.json({ saved_searches: data ?? [] });
});

export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, savedSearchBodySchema);
  if (error) return error;
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("saved_searches")
    .select("id, query")
    .eq("profile_id", session.user.id)
    .limit(MAX_SAVED_SEARCHES + 1);
  if (existingError) return jsonError(500, existingError.message);
  if ((existing ?? []).length >= MAX_SAVED_SEARCHES) {
    return jsonError(409, `You can save up to ${MAX_SAVED_SEARCHES} searches`);
  }

  const incomingQuery = stableJson(data.query);
  const duplicate = (existing ?? []).find(
    (row) => stableJson(row.query) === incomingQuery,
  );
  if (duplicate) return jsonError(409, "This search is already saved");

  const { data: row, error: insertError } = await supabase
    .from("saved_searches")
    .insert({ ...data, profile_id: session.user.id })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ saved_search: row }, { status: 201 });
});
