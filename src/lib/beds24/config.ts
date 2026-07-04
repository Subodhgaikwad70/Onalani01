/** Canonical Beds24 v2 base URL (fixes legacy `api.beds24.com` typos in env). */
export function getBeds24ApiBase(): string {
  const raw = process.env.BEDS24_API_BASE?.trim();
  if (!raw || raw.includes("api.beds24.com")) {
    return "https://beds24.com/api/v2";
  }
  return raw;
}
