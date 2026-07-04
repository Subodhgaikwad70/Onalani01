import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createReviewBodySchema } from "@/lib/reviews/schemas";

import {
  REVIEW_WINDOW_DAYS,
  canGuestReviewListing,
} from "@/lib/reviews/eligibility";

/**
 * POST /api/reviews — submit a guest-on-listing OR host-on-guest review.
 *
 * Rules enforced server-side:
 *   - Booking must belong to the author (as guest or host depending on subject_type)
 *   - Booking must be 'completed'
 *   - Submission window: within REVIEW_WINDOW_DAYS of check_out
 *   - One review per (booking, author, subject_type)
 *
 * Reviews are published once both sides have submitted OR the window closes
 * (the latter is handled by /api/cron/close-review-windows).
 */
export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, createReviewBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const { data: booking, error: lookupError } = await admin
    .from("bookings")
    .select("*")
    .eq("id", data.booking_id)
    .maybeSingle();
  if (lookupError) return jsonError(500, lookupError.message);
  if (!booking) return jsonError(404, "Booking not found");

  let subjectId: string;
  if (data.subject_type === "listing") {
    if (booking.guest_id !== session.user.id) {
      return jsonError(403, "Only the guest can review the listing");
    }

    const { data: existingReview } = await admin
      .from("reviews")
      .select("id")
      .eq("booking_id", data.booking_id)
      .eq("author_id", session.user.id)
      .eq("subject_type", "listing")
      .maybeSingle();
    if (existingReview) {
      return jsonError(409, "You have already reviewed this stay");
    }

    if (!canGuestReviewListing(booking)) {
      if (booking.status === "completed" || booking.check_out) {
        const checkOut = new Date(`${booking.check_out}T00:00:00Z`);
        const deadline = new Date(checkOut);
        deadline.setUTCDate(deadline.getUTCDate() + REVIEW_WINDOW_DAYS);
        if (new Date() > deadline) {
          return jsonError(409, `Review window of ${REVIEW_WINDOW_DAYS} days has closed`);
        }
      }
      return jsonError(409, "Reviews can only be left after checkout");
    }

    if (
      (booking.status === "confirmed" || booking.status === "in_stay") &&
      booking.check_out <= new Date().toISOString().slice(0, 10)
    ) {
      await admin
        .from("bookings")
        .update({ status: "completed" })
        .eq("id", booking.id)
        .in("status", ["confirmed", "in_stay"]);
    }

    subjectId = booking.listing_id;
  } else {
    if (!isAdminRole(session.role)) {
      return jsonError(403, "Only staff can review guests");
    }
    if (booking.status !== "completed") {
      return jsonError(409, "Reviews can only be left after stay completion");
    }
    const checkOut = new Date(`${booking.check_out}T00:00:00Z`);
    const deadline = new Date(checkOut);
    deadline.setUTCDate(deadline.getUTCDate() + REVIEW_WINDOW_DAYS);
    if (new Date() > deadline) {
      return jsonError(409, `Review window of ${REVIEW_WINDOW_DAYS} days has closed`);
    }
    subjectId = booking.guest_id;
  }

  const supabase = await createSupabaseServerClient();
  const { data: review, error: insertError } = await supabase
    .from("reviews")
    .insert({
      booking_id: data.booking_id,
      author_id: session.user.id,
      subject_type: data.subject_type,
      subject_id: subjectId,
      overall_rating: data.overall_rating,
      public_body: data.public_body ?? null,
      private_feedback: data.private_feedback ?? null,
      is_published: false,
      published_at: null,
    })
    .select("*")
    .single();
  if (insertError) return jsonError(400, insertError.message);

  if (data.criteria.length > 0) {
    const { error: critError } = await supabase
      .from("review_criteria_scores")
      .insert(
        data.criteria.map((c) => ({
          review_id: review.id,
          criterion: c.criterion,
          score: c.score,
        })),
      );
    if (critError) return jsonError(400, critError.message);
  }

  const counterpartSubjectType =
    data.subject_type === "listing" ? "guest" : "listing";
  const { data: counterpart } = await admin
    .from("reviews")
    .select("id")
    .eq("booking_id", data.booking_id)
    .eq("subject_type", counterpartSubjectType)
    .maybeSingle();

  if (counterpart) {
    const publishedAt = new Date().toISOString();
    await admin
      .from("reviews")
      .update({ is_published: true, published_at: publishedAt })
      .eq("booking_id", data.booking_id)
      .in("subject_type", ["listing", "guest"]);
    review.is_published = true;
    review.published_at = publishedAt;
  }

  return Response.json({ review }, { status: 201 });
});
