/**
 * Returns true if the request carries the Vercel Cron secret (or, in dev,
 * the configured CRON_SECRET). All /api/cron/* handlers should call this
 * before doing any work.
 *
 * Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}`; we accept that or
 * an `x-cron-secret` header for self-hosted scheduling.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret === secret) return true;
  return false;
}
