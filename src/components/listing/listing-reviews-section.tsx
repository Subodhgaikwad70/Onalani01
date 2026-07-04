import { formatDate } from "@/lib/format";
import type { ListingReviewsSummary } from "@/lib/reviews/listing-reviews";

function guestLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Guest";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-[#222222]">
      <span aria-hidden className="text-[#d99e64]">
        ★
      </span>
      {rating.toFixed(1)}
    </span>
  );
}

export function ListingReviewsSection({
  summary,
}: {
  summary: ListingReviewsSummary;
}) {
  if (summary.reviews.length === 0) return null;

  const { rating_avg, rating_count, reviews } = summary;

  return (
    <div className="border-b border-[#dddddd] py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Guest reviews</h2>
          {rating_avg != null && rating_count > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#5c6360]">
              <StarRating rating={Number(rating_avg)} />
              <span aria-hidden>·</span>
              <span>
                {rating_count} review{rating_count === 1 ? "" : "s"}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-8 divide-y divide-[#ececec]">
        {reviews.map((review) => {
          const response = Array.isArray(review.review_responses)
            ? review.review_responses[0]
            : review.review_responses;

          return (
            <li key={review.id} className="py-6 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {review.profiles?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={review.profiles.avatar_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4f6f5] text-sm font-semibold text-[#5c6360]"
                    >
                      {guestLabel(review.profiles?.display_name).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[#222222]">
                      {guestLabel(review.profiles?.display_name)}
                    </p>
                    {review.published_at ? (
                      <p className="text-xs text-[#9ca3af]">
                        {formatDate(review.published_at, "en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <StarRating rating={review.overall_rating} />
              </div>

              {review.public_body ? (
                <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-[#4b5563]">
                  {review.public_body}
                </p>
              ) : null}

              {response ? (
                <div className="mt-4 max-w-3xl rounded-xl border border-[#e2e8e4] bg-[#fafcfb] px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">
                    Response from host
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#4b5563]">
                    {response.body}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
