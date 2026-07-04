export type AdminReviewAuthor = {
  display_name: string | null;
  avatar_url?: string | null;
};

export type AdminReviewListingEmbed = {
  slug: string;
  unit_type: string | null;
  properties: { property_name: string } | null;
};

export type AdminReviewBookingEmbed = {
  code: string;
  check_in: string;
  check_out: string;
  listings: AdminReviewListingEmbed | AdminReviewListingEmbed[] | null;
};

export type AdminReviewListRow = {
  id: string;
  overall_rating: number;
  public_body: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  subject_type: "listing" | "guest";
  booking_id: string;
  author: AdminReviewAuthor | null;
  bookings: AdminReviewBookingEmbed | AdminReviewBookingEmbed[] | null;
  review_responses: Pick<AdminReviewResponse, "body"> | Pick<AdminReviewResponse, "body">[] | null;
};

export type AdminReviewCriterion = {
  criterion: string;
  score: number;
};

export type AdminReviewResponse = {
  body: string;
  created_at: string;
  responder: AdminReviewAuthor | null;
};

export type AdminReviewDetail = Omit<AdminReviewListRow, "review_responses"> & {
  private_feedback: string | null;
  review_criteria_scores: AdminReviewCriterion[];
  review_responses: AdminReviewResponse | AdminReviewResponse[] | null;
};

export function adminReviewBooking(
  row: AdminReviewListRow | AdminReviewDetail,
): AdminReviewBookingEmbed | null {
  const raw = row.bookings;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function adminReviewListing(
  row: AdminReviewListRow | AdminReviewDetail,
): AdminReviewListingEmbed | null {
  const booking = adminReviewBooking(row);
  const raw = booking?.listings;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function adminReviewListingTitle(row: AdminReviewListRow | AdminReviewDetail): string {
  const listing = adminReviewListing(row);
  const propName = listing?.properties?.property_name?.trim();
  const unit = listing?.unit_type?.trim();
  if (propName && unit) return `${propName} · ${unit}`;
  if (propName) return propName;
  if (unit) return unit;
  return listing?.slug ?? "Listing";
}

export function adminReviewHasHostResponse(
  responses: AdminReviewListRow["review_responses"] | AdminReviewDetail["review_responses"],
): boolean {
  if (!responses) return false;
  const row = Array.isArray(responses) ? responses[0] : responses;
  return Boolean(row?.body?.trim());
}
