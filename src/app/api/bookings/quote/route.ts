import { z } from "zod";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeQuote,
  type Fee,
  type PricingRule,
  type TaxRate,
} from "@/lib/bookings/pricing";
import {
  applyCancellationPolicyToBreakdown,
  buildCancellationRateOptions,
  GUEST_CHECKOUT_DEFAULT_POLICY_KEY,
  isCancellationPolicyKey,
} from "@/lib/bookings/cancellation-policies";

const quoteBodySchema = z.object({
  listing_slug: z.string().trim().min(1),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.object({
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20).default(0),
    infants: z.number().int().min(0).max(10).default(0),
    pets: z.number().int().min(0).max(5).default(0),
  }),
  cancellation_policy_key: z
    .enum(["firm", "super_strict", "non_refundable"])
    .optional(),
});

/**
 * POST /api/bookings/quote — pure pricing preview, no DB writes, no auth needed.
 * Reads listing + fees + rules + tax rates and runs the pricing engine.
 *
 * Per-day price overrides come from `price_cache` if a fresh row exists for
 * the requested date range; otherwise we fall back to base_price_cents and
 * Phase 4's Beds24 cache layer will populate per-day rows on-demand once it
 * is wired in.
 */
export async function POST(request: Request) {
  const { data: body, error } = await parseJsonBody(request, quoteBodySchema);
  if (error) return error;

  const checkIn = new Date(`${body.check_in}T00:00:00Z`);
  const checkOut = new Date(`${body.check_out}T00:00:00Z`);
  if (checkOut <= checkIn) {
    return jsonError(400, "check_out must be strictly after check_in");
  }

  const supabase = createSupabaseAdmin();

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id, base_price_cents, currency, unit_occupancy, min_nights, max_nights, property_id",
    )
    .eq("slug", body.listing_slug)
    .maybeSingle();
  if (listingError) return jsonError(500, listingError.message);
  if (!listing) return jsonError(404, "Listing not found");

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (nights < (listing.min_nights ?? 1)) {
    return jsonError(
      400,
      `Stay must be at least ${listing.min_nights} night(s)`,
    );
  }
  if (listing.max_nights && nights > listing.max_nights) {
    return jsonError(400, `Stay must be at most ${listing.max_nights} nights`);
  }

  const [feesResult, rulesResult, propertyTaxResult, perDayResult, hostDaysResult] =
    await Promise.all([
      supabase.from("listing_fees").select("*").eq("listing_id", listing.id),
      supabase
        .from("listing_pricing_rules")
        .select("*")
        .eq("listing_id", listing.id)
        .eq("is_active", true),
      supabase
        .from("property_tax_rates")
        .select("tax_rate_id, tax_rates(*)")
        .eq("property_id", listing.property_id),
      supabase
        .from("price_cache")
        .select("date, price_cents, currency")
        .eq("listing_id", listing.id)
        .gte("date", body.check_in)
        .lt("date", body.check_out),
      supabase
        .from("listing_calendar_day_overrides")
        .select("date, price_cents")
        .eq("listing_id", listing.id)
        .gte("date", body.check_in)
        .lt("date", body.check_out),
    ]);

  if (feesResult.error) return jsonError(500, feesResult.error.message);
  if (rulesResult.error) return jsonError(500, rulesResult.error.message);
  if (propertyTaxResult.error)
    return jsonError(500, propertyTaxResult.error.message);
  // perDayResult.error is non-fatal — price_cache may not exist yet (Phase 4)
  // hostDaysResult.error is non-fatal — table may not exist until migration applied

  const taxRates: TaxRate[] = (
    (propertyTaxResult.data ?? []) as Array<{
      tax_rates: TaxRate | TaxRate[] | null;
    }>
  )
    .flatMap((row) =>
      Array.isArray(row.tax_rates)
        ? row.tax_rates
        : row.tax_rates
          ? [row.tax_rates]
          : [],
    )
    .filter(Boolean);

  const perDayPrices: Record<string, number> = {};
  for (const row of perDayResult.data ?? []) {
    perDayPrices[row.date as string] = row.price_cents as number;
  }
  for (const row of hostDaysResult.data ?? []) {
    if (row.price_cents != null) {
      perDayPrices[row.date as string] = row.price_cents as number;
    }
  }

  const baseBreakdown = computeQuote({
    basePriceCents: listing.base_price_cents ?? 0,
    currency: listing.currency ?? "USD",
    checkIn,
    checkOut,
    guests: {
      adults: body.guests.adults,
      children: body.guests.children,
      infants: body.guests.infants,
      pets: body.guests.pets,
    },
    fees: (feesResult.data ?? []) as Fee[],
    pricingRules: (rulesResult.data ?? []) as PricingRule[],
    taxRates,
    perDayPriceCents: perDayPrices,
    baseOccupancy: listing.unit_occupancy ?? 2,
  });

  const rateOptions = buildCancellationRateOptions(baseBreakdown);
  const selectedKey = isCancellationPolicyKey(body.cancellation_policy_key)
    ? body.cancellation_policy_key
    : GUEST_CHECKOUT_DEFAULT_POLICY_KEY;
  const quote = applyCancellationPolicyToBreakdown(baseBreakdown, selectedKey);

  return Response.json({
    quote,
    cancellation_policy_key: selectedKey,
    rate_options: rateOptions,
  });
}
