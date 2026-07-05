import { isCronAuthorized } from "@/lib/cron/auth";
import { jsonError } from "@/lib/auth/session";
import { warmBeds24ListingCaches } from "@/lib/beds24/warm-listings";

/**
 * GET /api/cron/cache-warm — pre-fetch availability + price for the next 90
 * days for Beds24-linked listings (same logic as the in-process scheduler).
 *
 * Use on serverless hosts when background refresh is disabled via
 * `BEDS24_DISABLE_BACKGROUND_REFRESH`. Vercel Hobby allows at most one run
 * per day (see vercel.json); cache also refreshes on demand when stale.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return jsonError(401, "Unauthorized");

  const { warmed, from, to } = await warmBeds24ListingCaches();
  return Response.json({ warmed, range: { from, to } });
}
