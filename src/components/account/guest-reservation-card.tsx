import Link from "next/link";
import { OpenBookingThreadButton } from "@/components/messaging/open-booking-thread-button";
import { cn } from "@/lib/utils";
import {
  bookingAddressLines,
  bookingListingHref,
  bookingMapsUrl,
  bookingStayTitle,
  bookingThumbnail,
  type GuestBookingWithListing,
} from "@/lib/bookings/display";
import { formatDate } from "@/lib/format";
import { canGuestReviewListing } from "@/lib/reviews/eligibility";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1540544660476-64972bc55f24?auto=format&fit=crop&w=600&q=85";

export function GuestReservationCard({
  booking,
  className,
}: {
  booking: GuestBookingWithListing;
  className?: string;
}) {
  const title = bookingStayTitle(booking);
  const { street, cityLine } = bookingAddressLines(booking);
  const thumb = bookingThumbnail(booking) ?? FALLBACK_IMG;
  const mapsUrl = bookingMapsUrl(booking);
  const listingHref = bookingListingHref(booking);
  const statusLabel = booking.status.replace(/_/g, " ");
  const canReview = canGuestReviewListing(booking, {
    hasExistingReview: booking.guest_listing_review_submitted,
  });

  const dateCompact = `${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}`;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-[#e2e8e4] bg-white shadow-sm transition hover:border-[#c5d4cc] hover:shadow-md sm:flex-row",
        className,
      )}
    >
      <div className="relative h-44 shrink-0 sm:h-auto sm:w-[168px] md:w-[200px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote stay thumbnails */}
        <img src={thumb} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        <div className="min-w-0 flex-1 border-b border-[#eef2ef] p-4 md:border-b-0 md:border-r">
          {listingHref ? (
            <Link
              href={listingHref}
              className="inline-flex items-center gap-1 font-semibold text-[#1d6fb8] hover:underline"
            >
              {title}
              <span aria-hidden className="text-sm">
                ›
              </span>
            </Link>
          ) : (
            <p className="font-semibold text-[#1f2937]">{title}</p>
          )}
          {(street || cityLine) && (
            <p className="mt-1 text-sm leading-snug text-[#5f6b66]">
              {[street, cityLine].filter(Boolean).join(" · ")}
            </p>
          )}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-[#1d6fb8] hover:underline"
            >
              View on map
            </a>
          ) : null}
          <p className="mt-3 text-xs uppercase tracking-wide text-[#9ca3af]">{statusLabel}</p>
        </div>

        <div className="flex shrink-0 flex-col justify-between gap-3 bg-[#f4f6f5] p-4 md:w-[240px]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
              Stay dates
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1f2937]">{dateCompact}</p>
            <p className="mt-2 text-xs text-[#6b7280]">
              Confirmation{" "}
              <span className="font-mono font-semibold text-[#374151]">{booking.code}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm font-medium">
            <Link href={`/account/trips/${booking.code}`} className="text-[#1d6fb8] hover:underline">
              View details
            </Link>
            {canReview ? (
              <Link
                href={`/account/trips/${booking.code}?review=1`}
                className="text-[#1e6a82] hover:underline"
              >
                Leave review
              </Link>
            ) : booking.guest_listing_review_submitted ? (
              <span className="text-[#9ca3af]">Review submitted</span>
            ) : null}
            <OpenBookingThreadButton
              bookingId={booking.id}
              inboxBasePath="/account/messages"
              variant="link"
              className="h-auto p-0 text-[#5f6b66] hover:text-[#1f2937]"
            >
              Message host
            </OpenBookingThreadButton>
          </div>
        </div>
      </div>
    </article>
  );
}
