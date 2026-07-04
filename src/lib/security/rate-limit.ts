/**
 * Tiny in-memory token-bucket rate limiter.
 *
 * Suitable for single-instance dev + low-volume production. For multi-instance
 * Vercel deployments, swap to Upstash Ratelimit or a Redis-backed implementation.
 *
 * Usage:
 *   const allowed = rateLimit({ key: `login:${ip}`, limit: 10, windowMs: 60_000 });
 *   if (!allowed) return new Response("Too many requests", { status: 429 });
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): boolean {
  const now = Date.now();
  const existing = buckets.get(input.key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return true;
  }
  if (existing.count >= input.limit) return false;
  existing.count += 1;
  return true;
}

/** Convenience: pull the caller IP from a Request, with proxy headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
