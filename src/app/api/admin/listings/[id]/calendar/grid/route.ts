import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import {
  getAvailability,
  type AvailabilityOverrideStatus,
} from "@/lib/beds24/cache";
import { shouldSubtractLocalBooking } from "@/lib/bookings/local-availability";
import { eachCalendarDate } from "@/lib/calendar/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { id: string };

const PENDING_PAYMENT_TTL_MINUTES = 30;

/** GET /api/admin/listings/{id}/calendar/grid?from=&to= — half-open [from, to). */
export const GET = requireAdmin<Params>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return jsonError(400, "from and to are required (yyyy-mm-dd)");
    }
    if (to <= from) {
      return jsonError(400, "to must be after from");
    }

    const supabase = await createSupabaseServerClient();
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select(
        "id, slug, unit_type, photos_url, beds24_room_id, base_price_cents, currency, min_nights, max_nights, property_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (listingError) return jsonError(500, listingError.message);
    if (!listing) return jsonError(404, "Listing not found");

    const currency = (listing.currency as string | null) ?? "USD";
    const baseCents = (listing.base_price_cents as number | null) ?? 0;

    const [
      availResult,
      blocksResult,
      bookingsResult,
      overridesResult,
      rulesResult,
    ] = await Promise.all([
      getAvailability(
        id,
        listing.beds24_room_id as string | null,
        { from, to },
        currency,
      ),
      supabase
        .from("calendar_blocks")
        .select("id, starts_on, ends_on, reason")
        .eq("listing_id", id)
        .gte("ends_on", from)
        .lt("starts_on", to),
      supabase
        .from("bookings")
        .select(
          "id, code, check_in, check_out, status, adults, children, created_at, beds24_booking_id, guest_profile:profiles!bookings_guest_id_fkey(display_name)",
        )
        .eq("listing_id", id)
        .lt("check_in", to)
        .gt("check_out", from)
        .in("status", [
          "pending_payment",
          "requested",
          "confirmed",
          "in_stay",
        ]),
      supabase
        .from("listing_calendar_day_overrides")
        .select(
          "date, price_cents, min_stay, check_in_allowed, check_out_allowed",
        )
        .eq("listing_id", id)
        .gte("date", from)
        .lt("date", to),
      supabase
        .from("listing_pricing_rules")
        .select("id, kind, config, starts_on, ends_on, priority, is_active")
        .eq("listing_id", id)
        .eq("is_active", true)
        .order("priority", { ascending: true }),
    ]);

    if (blocksResult.error) return jsonError(500, blocksResult.error.message);
    if (bookingsResult.error) return jsonError(500, bookingsResult.error.message);
    if (overridesResult.error) return jsonError(500, overridesResult.error.message);
    if (rulesResult.error) return jsonError(500, rulesResult.error.message);

    const available = { ...availResult.available };
    const minStayMap = { ...availResult.minStay };
    const maxStayMap = { ...availResult.maxStay };
    const overrideStatusMap: Record<string, AvailabilityOverrideStatus> = {
      ...availResult.overrideStatus,
    };
    const pricesCents = { ...availResult.pricesCents };

    for (const o of overridesResult.data ?? []) {
      const d = o.date as string;
      if (o.price_cents != null) pricesCents[d] = o.price_cents as number;
      if (o.min_stay != null) minStayMap[d] = o.min_stay as number;
      if (o.check_in_allowed === false && o.check_out_allowed === false) {
        overrideStatusMap[d] = "nocheckinorcheckout";
        available[d] = false;
      } else if (o.check_in_allowed === false) {
        overrideStatusMap[d] = "nocheckin";
        available[d] = false;
      } else if (o.check_out_allowed === false) {
        overrideStatusMap[d] = "nocheckout";
        available[d] = false;
      }
    }

    const stalePendingCutoffIso = new Date(
      Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    type BookRow = Record<string, unknown> & {
      status?: string;
      created_at?: string | null;
      beds24_booking_id?: string | null;
    };
    const beds24RoomLinked = Boolean(listing.beds24_room_id);
    const rawBookings = (bookingsResult.data ?? []) as BookRow[];
    const blockingBookings = rawBookings.filter((bRow) =>
      shouldSubtractLocalBooking(bRow, beds24RoomLinked, stalePendingCutoffIso),
    );

    for (const block of blocksResult.data ?? []) {
      const start = block.starts_on as string;
      const end = block.ends_on as string;
      for (const date of eachCalendarDate(from, to)) {
        if (date >= start && date <= end) {
          available[date] = false;
        }
      }
    }

    for (const booking of blockingBookings) {
      const start = booking.check_in as string;
      const endEx = booking.check_out as string;
      for (const date of eachCalendarDate(from, to)) {
        if (date >= start && date < endEx) {
          available[date] = false;
        }
      }
    }

    const bookings = rawBookings.map((b: Record<string, unknown>) => {
      const gp = b.guest_profile as { display_name?: string } | null;
      return {
        id: b.id,
        code: b.code,
        check_in: b.check_in,
        check_out: b.check_out,
        status: b.status,
        adults: b.adults,
        children: b.children,
        guest_display_name: gp?.display_name ?? "Guest",
      };
    });

    const days: Array<{
      date: string;
      price_cents: number;
      currency: string;
      min_stay: number | null;
      max_stay: number | null;
      override_status: AvailabilityOverrideStatus;
      available: boolean;
      calendar_block: boolean;
      calendar_override_price: boolean;
      calendar_override_min_stay: boolean;
      booking_ids: string[];
    }> = [];

    const blockRows = blocksResult.data ?? [];

    for (const date of eachCalendarDate(from, to)) {
      let hostBlock = false;
      for (const block of blockRows) {
        const start = block.starts_on as string;
        const end = block.ends_on as string;
        if (date >= start && date <= end) {
          hostBlock = true;
          break;
        }
      }

      const bookingIds: string[] = [];
      for (const b of bookings) {
        const start = b.check_in as string;
        const endEx = b.check_out as string;
        if (date >= start && date < endEx) {
          bookingIds.push(b.id as string);
        }
      }

      const ov = (overridesResult.data ?? []).find(
        (r: { date: string }) => r.date === date,
      ) as
        | {
            price_cents?: number | null;
            min_stay?: number | null;
          }
        | undefined;

      const price = pricesCents[date] ?? baseCents;

      days.push({
        date,
        price_cents: price,
        currency: availResult.currency,
        min_stay: minStayMap[date] ?? null,
        max_stay: maxStayMap[date] ?? null,
        override_status: overrideStatusMap[date] ?? "none",
        available: available[date] ?? true,
        calendar_block: hostBlock,
        calendar_override_price: ov?.price_cents != null,
        calendar_override_min_stay: ov?.min_stay != null,
        booking_ids: bookingIds,
      });
    }

    return Response.json({
      listing: {
        id: listing.id,
        slug: listing.slug,
        unit_type: listing.unit_type,
        photos_url: listing.photos_url,
        base_price_cents: listing.base_price_cents,
        currency: listing.currency,
        min_nights: listing.min_nights,
        max_nights: listing.max_nights,
        beds24_room_id: listing.beds24_room_id,
      },
      blocks: blocksResult.data ?? [],
      bookings,
      pricing_rules: rulesResult.data ?? [],
      days,
    });
  },
);
