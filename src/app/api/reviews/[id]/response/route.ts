import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const responseBodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

/** POST /api/reviews/{id}/response — staff reply to a guest review. */
export const POST = requireAdmin<Params>(async (req, ctx, session) => {
  const { id } = await ctx.params;
  const { data, error } = await parseJsonBody(req, responseBodySchema);
  if (error) return error;

  const supabase = await createSupabaseServerClient();
  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .select("id, subject_type")
    .eq("id", id)
    .maybeSingle();
  if (reviewError) return jsonError(500, reviewError.message);
  if (!review) return jsonError(404, "Review not found");
  if (review.subject_type !== "listing") {
    return jsonError(400, "Only listing reviews can be responded to");
  }

  const { data: row, error: insertError } = await supabase
    .from("review_responses")
    .upsert(
      {
        review_id: id,
        responder_id: session.user.id,
        body: data.body,
      },
      { onConflict: "review_id" },
    )
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);
  return Response.json({ response: row });
});
