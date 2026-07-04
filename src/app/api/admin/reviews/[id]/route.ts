import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { recordAdminAction } from "@/lib/admin/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const DETAIL_SELECT = `
  id,
  overall_rating,
  public_body,
  private_feedback,
  is_published,
  published_at,
  created_at,
  subject_type,
  booking_id,
  author:profiles!reviews_author_id_fkey(display_name, avatar_url),
  bookings(
    code,
    check_in,
    check_out,
    listings(
      slug,
      unit_type,
      properties(property_name)
    )
  ),
  review_criteria_scores(criterion, score),
  review_responses(
    body,
    created_at,
    responder:profiles!review_responses_responder_id_fkey(display_name)
  )
`;

const updateBodySchema = z.object({
  is_published: z.boolean().optional(),
  private_feedback: z.string().max(4000).optional().nullable(),
  overall_rating: z.number().int().min(1).max(5).optional(),
});

/** GET /api/admin/reviews/{id} */
export const GET = requireAdmin<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, "Review not found");
  return Response.json({ review: data });
});

/** PATCH /api/admin/reviews/{id} — moderate or edit a review. */
export const PATCH = requireAdmin<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, updateBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: before, error: beforeError } = await supabase
    .from("reviews")
    .select("is_published, public_body, private_feedback, overall_rating")
    .eq("id", id)
    .maybeSingle();
  if (beforeError) return jsonError(500, beforeError.message);
  if (!before) return jsonError(404, "Review not found");

  const patch: Record<string, unknown> = { ...data };
  if (data.is_published === true && !before.is_published) {
    patch.published_at = new Date().toISOString();
  }
  if (data.is_published === false) {
    patch.published_at = null;
  }

  const { data: row, error: updateError } = await supabase
    .from("reviews")
    .update(patch)
    .eq("id", id)
    .select(DETAIL_SELECT)
    .single();
  if (updateError) return jsonError(400, updateError.message);

  await recordAdminAction({
    adminId: session.user.id,
    action: "review.update",
    targetType: "review",
    targetId: id,
    before,
    after: data,
  });

  return Response.json({ review: row });
});
