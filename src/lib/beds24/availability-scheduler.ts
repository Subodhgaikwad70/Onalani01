import { CACHE_TTL_SECONDS } from "@/lib/beds24/cache";
import { isBeds24Configured } from "@/lib/beds24/auth";
import { warmBeds24ListingCaches } from "@/lib/beds24/warm-listings";

const g = globalThis as typeof globalThis & {
  __onalaniBeds24WarmInterval?: ReturnType<typeof setInterval>;
};

/**
 * Runs {@link warmBeds24ListingCaches} on startup and every {@link CACHE_TTL_SECONDS}
 * while this Node process is alive (`next dev` / `next start`).
 *
 * Skips when Beds24 is not configured, or when `BEDS24_DISABLE_BACKGROUND_REFRESH`
 * is `1` or `true` (use `/api/cron/cache-warm` on serverless instead).
 */
export function startBeds24AvailabilityCacheScheduler(): void {
  const disabled = process.env.BEDS24_DISABLE_BACKGROUND_REFRESH;
  if (disabled === "1" || disabled === "true") return;
  if (!isBeds24Configured()) return;

  if (g.__onalaniBeds24WarmInterval) {
    clearInterval(g.__onalaniBeds24WarmInterval);
  }

  const tick = () => {
    void warmBeds24ListingCaches().catch((err) => {
      console.error("[beds24/scheduler] tick failed", err);
    });
  };

  tick();
  g.__onalaniBeds24WarmInterval = setInterval(tick, CACHE_TTL_SECONDS * 1000);
}
