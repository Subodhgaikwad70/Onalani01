import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeQuote,
  type Fee,
  type PricingRule,
  type TaxRate,
} from "@/lib/bookings/pricing";
import { getStripe } from "@/lib/stripe/client";
import { isAdminRole } from "@/lib/auth/roles";
import { redeemCreditsForBooking } from "@/lib/credits/redemption";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { ensureBeds24BookingSynced } from "@/lib/beds24/sync-booking";
import { useBeds24StripeForListing } from "@/lib/beds24/booking-payment";
import { enrichBookingPaymentCard } from "@/lib/bookings/enrich-payment-card";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { todayIsoUtc } from "@/lib/reviews/eligibility";
import { getListingAvailabilitySlice } from "@/lib/bookings/listing-availability";
import { validateStayAgainstSlice } from "@/lib/booking/stay-validation";
import { log, requestIdFromHeaders } from "@/lib/observability/logger";
import {
  applyCancellationPolicyToBreakdown,
  GUEST_CHECKOUT_DEFAULT_POLICY_KEY,
} from "@/lib/bookings/cancellation-policies";
import { loadCancellationPolicyByKey } from "@/lib/bookings/load-cancellation-policy";
import { fulfillRecoveryCreditsForBooking } from "@/lib/bookings/cancellation-recovery";
import { bookingIdentifierLookup } from "@/lib/bookings/booking-identifiers";

const HOLD_TTL_MINUTES = 15;
const PENDING_PAYMENT_TTL_MINUTES = 30;
const CONFIRMATION_CODE_ATTEMPTS = 5;
const BOOKINGS_DEFAULT_LIMIT = 25;
const BOOKINGS_MAX_LIMIT = 100;
const BOOKINGS_SEARCH_MATCH_LIMIT = 1000;
const NO_BOOKING_MATCH_ID = "00000000-0000-0000-0000-000000000000";
const TERMINAL_BOOKING_STATUSES = [
  "completed",
  "cancelled_by_guest",
  "cancelled_by_admin",
  "declined",
  "expired",
];
const ACTIVE_BOOKING_STATUSES = [
  "confirmed",
  "pending_payment",
  "requested",
  "in_stay",
];
const BOOKING_SORT_KEYS = new Set([
  "created_at",
  "updated_at",
  "check_in",
  "check_out",
]);

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

function collectIds(rows: unknown[] | null | undefined, target: Set<string>) {
  for (const row of rows ?? []) {
    const id = (row as { id?: string | null }).id;
    if (id) target.add(id);
  }
}

async function findBookingSearchIds({
  q,
  staffView,
  guestId,
}: {
  q: string;
  staffView: boolean;
  guestId: string;
}): Promise<string[]> {
  const admin = createSupabaseAdmin();
  const escaped = escapeLike(q);
  const normalized = q.toLowerCase().replace(/\s+/g, "_");
  const matchingStatuses = [...ACTIVE_BOOKING_STATUSES, ...TERMINAL_BOOKING_STATUSES]
    .filter((status, idx, arr) => arr.indexOf(status) === idx)
    .filter((status) => status.includes(normalized));

  let directBookings = admin
    .from("bookings")
    .select("id")
    .or(`code.ilike.%${escaped}%,guest_notes.ilike.%${escaped}%`)
    .limit(BOOKINGS_SEARCH_MATCH_LIMIT);
  let statusBookings = matchingStatuses.length
    ? admin
        .from("bookings")
        .select("id")
        .in("status", matchingStatuses)
        .limit(BOOKINGS_SEARCH_MATCH_LIMIT)
    : null;

  if (!staffView) {
    directBookings = directBookings.eq("guest_id", guestId);
    if (statusBookings) statusBookings = statusBookings.eq("guest_id", guestId);
  }

  const [directRes, statusRes, guestsRes, directListingsRes, propertiesRes] =
    await Promise.all([
      directBookings,
      statusBookings ?? Promise.resolve({ data: [] }),
      staffView
        ? admin
            .from("profiles")
            .select("id")
            .ilike("display_name", `%${escaped}%`)
            .limit(BOOKINGS_SEARCH_MATCH_LIMIT)
        : Promise.resolve({ data: [] }),
      admin
        .from("listings")
        .select("id")
        .or(`slug.ilike.%${escaped}%,unit_type.ilike.%${escaped}%`)
        .limit(BOOKINGS_SEARCH_MATCH_LIMIT),
      admin
        .from("properties")
        .select("id")
        .or(
          `slug.ilike.%${escaped}%,property_name.ilike.%${escaped}%,address.ilike.%${escaped}%,city.ilike.%${escaped}%,state.ilike.%${escaped}%,country.ilike.%${escaped}%`,
        )
        .limit(BOOKINGS_SEARCH_MATCH_LIMIT),
    ]);

  const guestIds = new Set<string>();
  collectIds(guestsRes.data, guestIds);

  const listingIds = new Set<string>();
  collectIds(directListingsRes.data, listingIds);

  const propertyIds = new Set<string>();
  collectIds(propertiesRes.data, propertyIds);
  if (propertyIds.size > 0) {
    const { data: propertyListings } = await admin
      .from("listings")
      .select("id")
      .in("property_id", [...propertyIds])
      .limit(BOOKINGS_SEARCH_MATCH_LIMIT);
    collectIds(propertyListings, listingIds);
  }

  const bookingIds = new Set<string>();
  collectIds(directRes.data, bookingIds);
  collectIds(statusRes.data, bookingIds);

  const bookingLookups = [];
  if (guestIds.size > 0) {
    let guestBookingQuery = admin
      .from("bookings")
      .select("id")
      .in("guest_id", [...guestIds])
      .limit(BOOKINGS_SEARCH_MATCH_LIMIT);
    if (!staffView) guestBookingQuery = guestBookingQuery.eq("guest_id", guestId);
    bookingLookups.push(guestBookingQuery);
  }
  if (listingIds.size > 0) {
    let listingBookingQuery = admin
      .from("bookings")
      .select("id")
      .in("listing_id", [...listingIds])
      .limit(BOOKINGS_SEARCH_MATCH_LIMIT);
    if (!staffView) listingBookingQuery = listingBookingQuery.eq("guest_id", guestId);
    bookingLookups.push(listingBookingQuery);
  }

  const lookupResults = await Promise.all(bookingLookups);
  for (const result of lookupResults) {
    collectIds(result.data, bookingIds);
  }

  return [...bookingIds].slice(0, BOOKINGS_SEARCH_MATCH_LIMIT);
}

const createBookingBodySchema = z.object({
  listing_slug: z.string().trim().min(1),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.object({
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20).default(0),
    infants: z.number().int().min(0).max(10).default(0),
    pets: z.number().int().min(0).max(5).default(0),
  }),
  guest_notes: z.string().max(2000).optional().nullable(),
  /** Maximum credit cents the guest agrees to redeem against this booking.
   *  Actual amount may be less if their balance is lower. Phase 7 wires this. */
  credit_apply_max_cents: z.number().int().min(0).default(0),
  /** Optional promo code — phase 7. */
  promo_code: z.string().max(40).optional().nullable(),
  /** Guest-selected cancellation tier (determines price + refund rules). */
  cancellation_policy_key: z
    .enum(["firm", "super_strict", "non_refundable"])
    .default(GUEST_CHECKOUT_DEFAULT_POLICY_KEY),
});

function createConfirmationCode(): string {
  return `ONA${randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
}

/**
 * GET /api/bookings — list bookings for the caller.
 * Guests see their own; staff use ?scope=admin for all bookings.
 */
export const GET = requireAuth(async (req, _ctx, session) => {
  const url = new URL(req.url);
  const staffView =
    (url.searchParams.get("scope") === "admin" ||
      url.searchParams.get("role") === "admin") &&
    isAdminRole(session.role);
  const status = url.searchParams.get("status");
  const bookingId = url.searchParams.get("id")?.trim();
  const view = url.searchParams.get("view");
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = boundedInt(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = boundedInt(
    url.searchParams.get("limit"),
    BOOKINGS_DEFAULT_LIMIT,
    BOOKINGS_MAX_LIMIT,
  );
  const offset = (page - 1) * limit;
  const sortParam = url.searchParams.get("sort");
  const sortKey =
    sortParam && BOOKING_SORT_KEYS.has(sortParam) ? sortParam : view === "upcoming" ? "check_in" : "created_at";
  const dirParam = url.searchParams.get("dir");
  const sortDir =
    dirParam === "asc" || dirParam === "desc"
      ? dirParam
      : view === "upcoming"
        ? "asc"
        : "desc";

  const supabase = await createSupabaseServerClient();
  const searchBookingIds =
    q && !bookingId
      ? await findBookingSearchIds({ q, staffView, guestId: session.user.id })
      : null;

  if (!staffView) {
    const today = todayIsoUtc();
    await createSupabaseAdmin()
      .from("bookings")
      .update({ status: "completed" })
      .eq("guest_id", session.user.id)
      .in("status", ["confirmed", "in_stay"])
      .lte("check_out", today);
  }

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      guest_profile:profiles!bookings_guest_id_fkey(display_name),
      listings (
        slug,
        unit_type,
        min_nights,
        max_nights,
        unit_occupancy,
        photos_url,
        roomPhotos_url,
        properties (
          slug,
          property_name,
          address,
          city,
          state,
          country,
          latitude,
          longitude,
          photos_url
        )
      )
    `,
      { count: bookingId ? undefined : "exact" },
    )
    .order(sortKey, { ascending: sortDir === "asc" });

  if (!staffView) {
    query = query.eq("guest_id", session.user.id);
  }

  if (bookingId) {
    const lookup = bookingIdentifierLookup(bookingId);
    query = query.eq(lookup.column, lookup.value);
  }
  if (status) query = query.eq("status", status);
  if (!status && !bookingId) {
    if (view === "upcoming") {
      query = query.in("status", ACTIVE_BOOKING_STATUSES).gte("check_out", todayIsoUtc());
    } else if (view === "past") {
      query = query.in("status", TERMINAL_BOOKING_STATUSES);
    } else if (view === "completed") {
      query = query.eq("status", "completed");
    } else if (view === "cancelled") {
      query = query.in(
        "status",
        TERMINAL_BOOKING_STATUSES.filter((s) => s !== "completed"),
      );
    }
  }
  if (q && !bookingId) {
    query = query.in(
      "id",
      searchBookingIds && searchBookingIds.length > 0
        ? searchBookingIds
        : [NO_BOOKING_MATCH_ID],
    );
  }
  if (!bookingId) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error, count } = await query;
  if (error) return jsonError(500, error.message);

  const bookings = data ?? [];

  if (bookingId && bookings.length === 1) {
    const admin = createSupabaseAdmin();
    bookings[0] = await enrichBookingPaymentCard(admin, bookings[0]);
  }

  if (!staffView && bookings.length > 0) {
    const admin = createSupabaseAdmin();
    const bookingIds = bookings.map((b) => b.id);
    const { data: guestReviews } = await admin
      .from("reviews")
      .select("booking_id")
      .in("booking_id", bookingIds)
      .eq("author_id", session.user.id)
      .eq("subject_type", "listing");

    const reviewedIds = new Set((guestReviews ?? []).map((r) => r.booking_id));
    return Response.json({
      bookings: bookings.map((b) => ({
        ...b,
        guest_listing_review_submitted: reviewedIds.has(b.id),
      })),
      page,
      limit,
      total: count ?? bookings.length,
      total_pages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
    });
  }

  return Response.json({
    bookings,
    page,
    limit,
    total: count ?? bookings.length,
    total_pages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
  });
});

/**
 * POST /api/bookings — create a booking + Stripe PaymentIntent.
 *
 * Steps:
 *   1. Validate body and load listing/property/cancellation policy.
 *   2. Take a short-lived booking_hold and check no overlapping confirmed
 *      bookings exist for the same listing.
 *   3. Compute pricing via the pricing engine.
 *   4. Insert booking row in pending_payment (or 'requested' for non-instant).
 *   5. Create Stripe PaymentIntent (platform account). Return client_secret.
 */
export const POST = requireAuth(async (req, _ctx, session) => {
  const requestId = requestIdFromHeaders(req.headers);
  if (!rateLimit({ key: `book:${session.user.id}:${clientIp(req)}`, limit: 20, windowMs: 60_000 })) {
    return jsonError(429, "Too many booking attempts; please slow down");
  }
  const { data: body, error } = await parseJsonBody(req, createBookingBodySchema);
  if (error) return error;

  const checkIn = new Date(`${body.check_in}T00:00:00Z`);
  const checkOut = new Date(`${body.check_out}T00:00:00Z`);
  if (checkOut <= checkIn) {
    return jsonError(400, "check_out must be after check_in");
  }
  if (body.check_in < todayIsoUtc()) {
    return jsonError(400, "Check-in cannot be in the past");
  }

  const admin = createSupabaseAdmin();
  const pendingCutoffIso = new Date(
    Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select(
      "id, base_price_cents, currency, unit_occupancy, min_nights, max_nights, instant_book, test_payment_mode, beds24_room_id, property_id",
    )
    .eq("slug", body.listing_slug)
    .maybeSingle();
  if (listingError) return jsonError(500, listingError.message);
  if (!listing) return jsonError(404, "Listing not found");

  const { data: property, error: propError } = await admin
    .from("properties")
    .select("id, instant_book, cancellation_policy_id")
    .eq("id", listing.property_id)
    .single();
  if (propError) return jsonError(500, propError.message);

  const totalGuests = body.guests.adults + body.guests.children;
  if (listing.unit_occupancy && totalGuests > listing.unit_occupancy) {
    return jsonError(
      400,
      `Listing accommodates up to ${listing.unit_occupancy} guests`,
    );
  }

  // Reap stale pending_payment bookings for this listing so they don't
  // permanently block dates when cron isn't running in local/dev.
  await admin
    .from("bookings")
    .update({ status: "expired" })
    .eq("listing_id", listing.id)
    .eq("status", "pending_payment")
    .lt("created_at", pendingCutoffIso);

  let availability;
  try {
    availability = await getListingAvailabilitySlice(admin, {
      listingId: listing.id,
      from: body.check_in,
      to: body.check_out,
      listing,
    });
  } catch (e) {
    log.error(
      "booking.availability_check_failed",
      {
        request_id: requestId,
        listing_slug: body.listing_slug,
        guest_id: session.user.id,
      },
      e,
    );
    return jsonError(503, "Could not verify availability; please try again");
  }

  const stayValidation = validateStayAgainstSlice(
    availability,
    body.check_in,
    body.check_out,
    {
      listingMinNights: listing.min_nights,
      listingMaxNights: listing.max_nights,
    },
  );
  if (!stayValidation.ok) {
    return jsonError(409, stayValidation.reason);
  }

  // Check overlap with active bookings (admin client to bypass RLS).
  const { data: overlap, error: overlapError } = await admin
    .from("bookings")
    .select("id")
    .eq("listing_id", listing.id)
    .in("status", [
      "pending_payment",
      "requested",
      "confirmed",
      "in_stay",
    ])
    .lt("check_in", body.check_out)
    .gt("check_out", body.check_in);
  if (overlapError) return jsonError(500, overlapError.message);
  if (overlap && overlap.length > 0) {
    return jsonError(409, "Selected dates are no longer available");
  }

  // Reap stale holds, then check for fresh holds.
  await admin.from("booking_holds").delete().lt("expires_at", new Date().toISOString());
  const { data: holds } = await admin
    .from("booking_holds")
    .select("id")
    .eq("listing_id", listing.id)
    .neq("guest_id", session.user.id)
    .lt("check_in", body.check_out)
    .gt("check_out", body.check_in)
    .gt("expires_at", new Date().toISOString());
  if (holds && holds.length > 0) {
    return jsonError(409, "Another guest is currently checking out for these dates");
  }

  // Place our own hold.
  const expiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);
  const { error: holdError } = await admin.from("booking_holds").insert({
    listing_id: listing.id,
    guest_id: session.user.id,
    check_in: body.check_in,
    check_out: body.check_out,
    expires_at: expiresAt.toISOString(),
  });
  if (holdError) return jsonError(500, holdError.message);

  // Resolve fees, rules, taxes, per-day cached prices.
  const [feesRes, rulesRes, propTaxRes, policyRes] = await Promise.all(
    [
      admin.from("listing_fees").select("*").eq("listing_id", listing.id),
      admin
        .from("listing_pricing_rules")
        .select("*")
        .eq("listing_id", listing.id)
        .eq("is_active", true),
      admin
        .from("property_tax_rates")
        .select("tax_rates(*)")
        .eq("property_id", listing.property_id),
      loadCancellationPolicyByKey(admin, body.cancellation_policy_key),
    ],
  );

  const taxRates: TaxRate[] = (
    (propTaxRes.data ?? []) as Array<{ tax_rates: TaxRate | TaxRate[] | null }>
  ).flatMap((r) =>
    Array.isArray(r.tax_rates) ? r.tax_rates : r.tax_rates ? [r.tax_rates] : [],
  );

  const perDay: Record<string, number> = { ...(availability.prices_cents ?? {}) };

  const baseBreakdown = computeQuote({
    basePriceCents: listing.base_price_cents,
    currency: listing.currency,
    checkIn,
    checkOut,
    guests: body.guests,
    fees: (feesRes.data ?? []) as Fee[],
    pricingRules: (rulesRes.data ?? []) as PricingRule[],
    taxRates,
    perDayPriceCents: perDay,
    baseOccupancy: listing.unit_occupancy ?? 2,
  });

  const breakdown = applyCancellationPolicyToBreakdown(
    baseBreakdown,
    body.cancellation_policy_key,
  );

  const cleaningFee = breakdown.fees.find((f) => f.kind === "cleaning")?.amount_cents ?? 0;
  const extraGuestFee = breakdown.fees.find((f) => f.kind === "extra_guest")?.amount_cents ?? 0;
  const serviceFee = breakdown.fees.find((f) => f.kind === "service")?.amount_cents ?? 0;

  // Validate + price promo if provided.
  let promoDiscount = 0;
  let promoRow: { id: string; code: string } | null = null;
  if (body.promo_code) {
    const { data: promo } = await admin
      .from("promo_codes")
      .select("*")
      .eq("code", body.promo_code.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    const now = new Date();
    if (!promo) {
      return jsonError(404, "Promo code not found");
    }
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return jsonError(400, "Promo not yet active");
    }
    if (promo.expires_at && new Date(promo.expires_at) <= now) {
      return jsonError(400, "Promo has expired");
    }
    if (
      promo.max_redemptions &&
      (promo.redemption_count ?? 0) >= promo.max_redemptions
    ) {
      return jsonError(400, "Promo is fully redeemed");
    }
    if (
      promo.min_subtotal_cents != null &&
      breakdown.subtotal_cents < promo.min_subtotal_cents
    ) {
      return jsonError(400, "Subtotal does not meet promo minimum");
    }

    const { count: guestPromoUses } = await admin
      .from("promo_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("promo_id", promo.id)
      .eq("guest_id", session.user.id);
    if (
      guestPromoUses != null &&
      guestPromoUses >= (promo.per_user_limit ?? 1)
    ) {
      return jsonError(400, "Per-user promo limit reached");
    }

    promoDiscount =
      promo.kind === "percent"
        ? Math.round(breakdown.subtotal_cents * (Number(promo.value) / 100))
        : Math.round(Number(promo.value) * 100);
    promoDiscount = Math.min(promoDiscount, breakdown.total_cents);
    promoRow = { id: promo.id, code: promo.code };
  }

  const totalAfterPromo = Math.max(0, breakdown.total_cents - promoDiscount);
  const totalCash = Math.max(0, totalAfterPromo - body.credit_apply_max_cents);

  const policy = policyRes;
  if (!policy) return jsonError(500, "No cancellation policy could be resolved");

  const isInstant = property.instant_book && listing.instant_book;
  const useTestPaymentMode = Boolean(listing.test_payment_mode);
  const needsPayment = !useTestPaymentMode && totalCash > 0;

  let initialStatus: "pending_payment" | "requested" | "confirmed";
  if (useTestPaymentMode && isInstant) {
    initialStatus = "pending_payment";
  } else if (useTestPaymentMode && !isInstant) {
    initialStatus = "requested";
  } else if (needsPayment) {
    initialStatus = "pending_payment";
  } else if (isInstant) {
    initialStatus = "confirmed";
  } else {
    initialStatus = "requested";
  }

  let booking = null;
  let insertError = null;
  for (let attempt = 0; attempt < CONFIRMATION_CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        code: createConfirmationCode(),
        guest_id: session.user.id,
        listing_id: listing.id,
        property_id: property.id,
        check_in: body.check_in,
        check_out: body.check_out,
        adults: body.guests.adults,
        children: body.guests.children,
        infants: body.guests.infants,
        pets: body.guests.pets,
        status: initialStatus,
        is_instant_book: isInstant,
        subtotal_cents: breakdown.subtotal_cents,
        cleaning_fee_cents: cleaningFee,
        extra_guest_fee_cents: extraGuestFee,
        service_fee_cents: serviceFee,
        taxes_cents: breakdown.taxes_total_cents,
        credit_applied_cents: 0, // updated below after actual redemption
        promo_discount_cents: promoDiscount,
        total_cents: totalCash,
        currency: breakdown.currency,
        pricing_breakdown: breakdown,
        cancellation_policy_snapshot: policy,
        guest_notes: body.guest_notes ?? null,
      })
      .select("*")
      .single();

    if (!error) {
      booking = data;
      insertError = null;
      break;
    }

    insertError = error;
    if ((error as { code?: string }).code !== "23505") break;
  }

  if (insertError || !booking) {
    return jsonError(
      400,
      insertError?.message ?? "Could not allocate a unique confirmation code",
    );
  }

  if (initialStatus === "confirmed") {
    await admin
      .from("bookings")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", booking.id);
    booking.confirmed_at = new Date().toISOString();
  }

  // Now redeem credits
  let creditApplied = 0;
  if (body.credit_apply_max_cents > 0) {
    creditApplied = await redeemCreditsForBooking({
      guestId: session.user.id,
      bookingId: booking.id,
      requestedCents: body.credit_apply_max_cents,
      currency: breakdown.currency,
    });
  }
  const finalTotalCash = Math.max(0, totalAfterPromo - creditApplied);
  // Always persist redemption results when credits were requested. The insert
  // leaves credit_applied_cents at 0; skipping the update when redemption
  // matched the optimistic total_cents left credits invisible in the DB.
  if (body.credit_apply_max_cents > 0) {
    await admin
      .from("bookings")
      .update({
        credit_applied_cents: creditApplied,
        total_cents: finalTotalCash,
      })
      .eq("id", booking.id);
    booking.credit_applied_cents = creditApplied;
    booking.total_cents = finalTotalCash;
  }

  if (promoRow && promoDiscount > 0) {
    const { data: redemptionId, error: redemptionError } = await admin.rpc(
      "record_promo_redemption",
      {
        p_promo_id: promoRow.id,
        p_booking_id: booking.id,
        p_guest_id: session.user.id,
        p_amount_cents: promoDiscount,
      },
    );
    if (redemptionError || !redemptionId) {
      await Promise.allSettled([
        admin
          .from("bookings")
          .update({ status: "expired" })
          .eq("id", booking.id),
        admin
          .from("booking_holds")
          .delete()
          .eq("listing_id", listing.id)
          .eq("guest_id", session.user.id)
          .eq("check_in", body.check_in)
          .eq("check_out", body.check_out),
      ]);
      return jsonError(
        409,
        redemptionError?.message ?? "Promo could not be redeemed",
      );
    }
    await admin.from("payment_history").insert({
      booking_id: booking.id,
      guest_id: session.user.id,
      kind: "promo_discount",
      amount_cents: promoDiscount,
      currency: breakdown.currency,
      promo_redemption_id: redemptionId,
    });
  }

  // Test mode bypass for instant book: confirm without Stripe.
  if (useTestPaymentMode && isInstant) {
    await Promise.all([
      admin
        .from("bookings")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("status", "pending_payment"),
      admin.from("payment_history").insert({
        booking_id: booking.id,
        guest_id: session.user.id,
        kind: "charge",
        amount_cents: finalTotalCash,
        currency: breakdown.currency,
        metadata: { source: "test_payment_mode", stripe_bypassed: true },
      }),
      admin
        .from("booking_holds")
        .delete()
        .eq("listing_id", listing.id)
        .eq("guest_id", session.user.id)
        .eq("check_in", body.check_in)
        .eq("check_out", body.check_out),
    ]);
    booking.status = "confirmed";
    booking.confirmed_at = new Date().toISOString();
  }

  // Test mode for request-to-book: send request without payment (dev only).
  if (useTestPaymentMode && !isInstant) {
    await admin
      .from("booking_holds")
      .delete()
      .eq("listing_id", listing.id)
      .eq("guest_id", session.user.id)
      .eq("check_in", body.check_in)
      .eq("check_out", body.check_out);
    booking.status = "requested";
  }

  // If credits zeroed the balance after insert, skip payment.
  if (booking.status === "pending_payment" && finalTotalCash <= 0) {
    const zeroStatus = isInstant ? "confirmed" : "requested";
    await admin
      .from("bookings")
      .update({
        status: zeroStatus,
        ...(zeroStatus === "confirmed"
          ? { confirmed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", booking.id);
    booking.status = zeroStatus;
    if (zeroStatus === "confirmed") {
      booking.confirmed_at = new Date().toISOString();
    }
    if (zeroStatus === "requested") {
      const { data: existingRequest } = await admin
        .from("booking_requests")
        .select("booking_id")
        .eq("booking_id", booking.id)
        .maybeSingle();
      if (!existingRequest) {
        await admin.from("booking_requests").insert({
          booking_id: booking.id,
          message: body.guest_notes ?? null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  const payNow = !useTestPaymentMode && finalTotalCash > 0 && booking.status === "pending_payment";

  if (booking.status === "requested") {
    const { data: existingRequest } = await admin
      .from("booking_requests")
      .select("booking_id")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (!existingRequest) {
      await admin.from("booking_requests").insert({
        booking_id: booking.id,
        message: body.guest_notes ?? null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  const useBeds24Stripe = useBeds24StripeForListing(listing.beds24_room_id);

  let clientSecret: string | null = null;
  const checkoutSessionId: string | null = null;
  const stripeConnectAccountId: string | null = null;
  const stripePublishableKey: string | null = null;
  const paymentMode: "test" | "stripe" | "beds24_stripe" = useTestPaymentMode
    ? "test"
    : useBeds24Stripe
      ? "beds24_stripe"
      : "stripe";

  // Platform PaymentIntent is created at booking time only for non-Beds24 listings.
  // Beds24 Stripe checkout is provisioned lazily in GET /api/bookings/[id]/pay-intent.
  if (payNow && !useBeds24Stripe && !checkoutSessionId && !clientSecret) {
    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.create({
        amount: finalTotalCash,
        currency: breakdown.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { booking_id: booking.id, booking_code: booking.code },
      });

      await admin
        .from("bookings")
        .update({
          stripe_payment_intent_id: intent.id,
          payment_provider: "platform",
        })
        .eq("id", booking.id);
      clientSecret = intent.client_secret;
    } catch (e) {
      log.error(
        "booking.payment_intent_failed",
        {
          request_id: requestId,
          booking_id: booking.id,
          guest_id: session.user.id,
          amount_cents: finalTotalCash,
          currency: breakdown.currency,
        },
        e,
      );
      await Promise.allSettled([
        admin
          .from("bookings")
          .update({ status: "expired" })
          .eq("id", booking.id)
          .eq("status", "pending_payment"),
        admin
          .from("booking_holds")
          .delete()
          .eq("listing_id", listing.id)
          .eq("guest_id", session.user.id)
          .eq("check_in", body.check_in)
          .eq("check_out", body.check_out),
      ]);
      return jsonError(
        500,
        "Could not initialize payment; please try again",
      );
    }
  }

  const inboxEvent =
    booking.status === "confirmed"
      ? "confirmed"
      : booking.status === "requested"
        ? "requested"
        : "pending_payment";

  if (booking.status === "confirmed" || booking.status === "requested") {
    try {
      await ensureBeds24BookingSynced(admin, booking.id);
    } catch (e) {
      log.error(
        "booking.beds24_sync_failed",
        { request_id: requestId, booking_id: booking.id },
        e,
      );
    }
  }

  if (booking.status === "confirmed") {
    try {
      await fulfillRecoveryCreditsForBooking(admin, {
        bookingId: booking.id as string,
        listingId: listing.id as string,
        checkIn: body.check_in,
        checkOut: body.check_out,
        subtotalCents: breakdown.subtotal_cents,
        currency: breakdown.currency,
      });
    } catch (e) {
      console.error("[bookings/create] recovery credit fulfillment failed", e);
    }
  }

  await syncBookingToAdminInbox(admin, {
    bookingId: booking.id,
    event: inboxEvent,
  });

  return Response.json(
    {
      booking,
      client_secret: clientSecret,
      checkout_session_id: checkoutSessionId,
      stripe_connect_account_id: stripeConnectAccountId,
      stripe_publishable_key: stripePublishableKey,
      payment_mode: paymentMode,
      requires_checkout: payNow,
      hold_expires_at: expiresAt.toISOString(),
    },
    { status: 201 },
  );
});
