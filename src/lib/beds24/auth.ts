/**
 * Beds24 API v2 access tokens.
 *
 * Uses `BEDS24_API_TOKEN` (short-lived) until it expires, then mints a new
 * access token from `BEDS24_REFRESH_TOKEN` via GET /authentication/token.
 * Minted tokens are cached in memory for the lifetime of the process.
 */

import { getBeds24ApiBase } from "@/lib/beds24/config";

export { getBeds24ApiBase } from "@/lib/beds24/config";

/** Refresh this long before expiry. */
const REFRESH_BUFFER_MS = 60_000;

export type Beds24AccessToken = {
  token: string;
  expiresAt: number;
  expiresInSeconds: number;
};

type TokenCache = Beds24AccessToken;

let tokenCache: TokenCache | null = null;

export function isBeds24Configured(): boolean {
  return Boolean(
    process.env.BEDS24_REFRESH_TOKEN?.trim() ||
      process.env.BEDS24_API_TOKEN?.trim(),
  );
}

function isCacheValid(cache: TokenCache | null): cache is TokenCache {
  return (
    cache != null && cache.expiresAt > Date.now() + REFRESH_BUFFER_MS
  );
}

/**
 * Short-lived Beds24 API token for the `token` request header.
 */
export async function getBeds24AccessToken(): Promise<string> {
  const access = await resolveBeds24AccessToken();
  return access.token;
}

/**
 * Return a valid access token — env token first, refresh when expired.
 */
export async function resolveBeds24AccessToken(): Promise<Beds24AccessToken> {
  if (isCacheValid(tokenCache)) {
    return tokenCache;
  }

  const envToken = process.env.BEDS24_API_TOKEN?.trim();
  if (envToken) {
    const remaining = await lookupTokenRemainingSeconds(envToken);
    if (remaining != null && remaining > REFRESH_BUFFER_MS / 1000) {
      tokenCache = {
        token: envToken,
        expiresInSeconds: remaining,
        expiresAt: Date.now() + remaining * 1000,
      };
      return tokenCache;
    }
  }

  return mintAndCacheFromRefreshToken();
}

/**
 * Force a new access token from the refresh token (e.g. after HTTP 401).
 */
export async function forceRefreshBeds24AccessToken(): Promise<string> {
  const access = await mintAndCacheFromRefreshToken();
  return access.token;
}

export function clearBeds24TokenCache(): void {
  tokenCache = null;
}

async function mintAndCacheFromRefreshToken(): Promise<TokenCache> {
  const refreshToken = process.env.BEDS24_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    const envToken = process.env.BEDS24_API_TOKEN?.trim();
    if (envToken) {
      return {
        token: envToken,
        expiresAt: Number.MAX_SAFE_INTEGER,
        expiresInSeconds: Number.MAX_SAFE_INTEGER,
      };
    }
    throw new Error(
      "BEDS24_REFRESH_TOKEN is not configured. Set it from Beds24 → Settings → API.",
    );
  }

  tokenCache = await mintAccessToken(refreshToken);
  return tokenCache;
}

/** Seconds until expiry, or null if the token is invalid / expired. */
async function lookupTokenRemainingSeconds(
  accessToken: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${getBeds24ApiBase()}/authentication/details`, {
      headers: {
        accept: "application/json",
        token: accessToken,
      },
      cache: "no-store",
    });

    const text = await res.text();
    let body: {
      validToken?: boolean;
      token?: { expiresIn?: number };
    } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return null;
    }

    if (!res.ok || body.validToken === false) {
      return null;
    }

    const expiresIn = body.token?.expiresIn;
    if (expiresIn == null || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      return null;
    }

    return Math.floor(expiresIn);
  } catch {
    return null;
  }
}

async function mintAccessToken(refreshToken: string): Promise<TokenCache> {
  const res = await fetch(`${getBeds24ApiBase()}/authentication/token`, {
    method: "GET",
    headers: {
      accept: "application/json",
      refreshToken,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: { token?: string; expiresIn?: number; error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!res.ok || !body.token) {
    throw new Error(
      body.error ??
        `Beds24 token refresh failed: ${res.status}${text ? ` — ${text}` : ""}`,
    );
  }

  const expiresInSeconds = body.expiresIn ?? 86_400;
  return {
    token: body.token,
    expiresInSeconds,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}
