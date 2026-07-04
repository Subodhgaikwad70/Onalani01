import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAvailability,
  type AvailabilityOverrideStatus,
} from "@/lib/beds24/cache";
import type { PublicAvailabilityPayload } from "@/lib/booking/stay-validation";
import { shouldSubtractLocalBooking } from "@/lib/bookings/local-availability";

const PENDING_PAYMENT_TTL_MINUTES = 30;

export type ListingAvailabilitySlice = PublicAvailabilityPayload & {
  currency: string;
};

type ListingRow = {
  id: string;
  beds24_room_id: string | null;
  currency: string | null;
  base_price_cents: number | null;
  min_nights: number | null;
  max_nights: number | null;
};

/**
 * Availability + nightly prices for a listing date range [from, to).
 * Refreshes from Beds24 when the listing is linked and cache is stale.
 */
export async function getListingAvailabilitySlice(
  admin: SupabaseClient,
  input: {
    listingId: string;
    from: string;
    to: string;
    excludeBookingId?: string;
    listing?: ListingRow | null;
  },
): Promise<ListingAvailabilitySlice> {
  let listing = input.listing;
  if (!listing) {
    const { data, error } = await admin
      .from("listings")
      .select(
        "id, beds24_room_id, currency, base_price_cents, min_nights, max_nights",
      )
      .eq("id", input.listingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Listing not found");
    listing = data as ListingRow;
  }

  const result = await getAvailability(
    listing.id,
    listing.beds24_room_id,
    { from: input.from, to: input.to },
    listing.currency ?? "USD",
  );

  const { data: hostDayRows } = await admin
    .from("listing_calendar_day_overrides")
    .select(
      "date, price_cents, min_stay, check_in_allowed, check_out_allowed",
    )
    .eq("listing_id", listing.id)
    .gte("date", input.from)
    .lt("date", input.to);

  const available = { ...result.available };
  const min_stay: Record<string, number | null> = { ...result.minStay };
  const max_stay: Record<string, number | null> = { ...result.maxStay };
  const override_status: Record<string, AvailabilityOverrideStatus> = {
    ...result.overrideStatus,
  };
  const prices_cents = { ...result.pricesCents };

  for (const row of hostDayRows ?? []) {
    const d = row.date as string;
    if (row.price_cents != null) {
      prices_cents[d] = row.price_cents as number;
    }
    if (row.min_stay != null) {
      min_stay[d] = row.min_stay as number;
    }
    if (row.check_in_allowed === false && row.check_out_allowed === false) {
      override_status[d] = "nocheckinorcheckout";
      available[d] = false;
    } else if (row.check_in_allowed === false) {
      override_status[d] = "nocheckin";
    } else if (row.check_out_allowed === false) {
      override_status[d] = "nocheckout";
    }
  }

  const { data: blocks } = await admin
    .from("calendar_blocks")
    .select("starts_on, ends_on")
    .eq("listing_id", listing.id)
    .gte("ends_on", input.from)
    .lt("starts_on", input.to);

  let bookingsQuery = admin
    .from("bookings")
    .select("id, status, check_in, check_out, created_at, beds24_booking_id")
    .eq("listing_id", listing.id)
    .in("status", ["pending_payment", "requested", "confirmed", "in_stay"])
    .lt("check_in", input.to)
    .gt("check_out", input.from);

  if (input.excludeBookingId) {
    bookingsQuery = bookingsQuery.neq("id", input.excludeBookingId);
  }

  const { data: activeBookings } = await bookingsQuery;

  for (const block of blocks ?? []) {
    const start = block.starts_on as string;
    const end = block.ends_on as string;
    for (const date of Object.keys(available)) {
      if (date >= start && date <= end) {
        available[date] = false;
      }
    }
  }

  const stalePendingCutoffIso = new Date(
    Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const beds24RoomLinked = Boolean(listing.beds24_room_id);

  for (const booking of activeBookings ?? []) {
    if (
      !shouldSubtractLocalBooking(
        booking,
        beds24RoomLinked,
        stalePendingCutoffIso,
      )
    ) {
      continue;
    }
    const start = booking.check_in as string;
    const end = booking.check_out as string;
    for (const date of Object.keys(available)) {
      if (date >= start && date < end) {
        available[date] = false;
      }
    }
  }

  const basePriceCents = Number(listing.base_price_cents ?? 0);
  if (basePriceCents > 0) {
    for (const date of Object.keys(available)) {
      if (prices_cents[date] == null) {
        prices_cents[date] = basePriceCents;
      }
    }
  }

  return {
    available,
    min_stay,
    max_stay,
    override_status,
    prices_cents,
    currency: result.currency,
  };
}
