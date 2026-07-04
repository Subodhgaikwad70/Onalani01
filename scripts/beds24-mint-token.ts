/**
 * Mint a short-lived Beds24 access token from BEDS24_REFRESH_TOKEN.
 * Usage: npx tsx scripts/beds24-mint-token.ts
 */

import { readFileSync, existsSync } from "node:fs";
import {
  forceRefreshBeds24AccessToken,
  isBeds24Configured,
  resolveBeds24AccessToken,
} from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";

function loadEnvFiles() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFiles();

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

async function main() {
  if (!isBeds24Configured()) {
    throw new Error("Set BEDS24_API_TOKEN and/or BEDS24_REFRESH_TOKEN in .env");
  }

  const base = getBeds24ApiBase();
  console.error(`Using BEDS24_API_BASE=${base}`);

  const resolved = await resolveBeds24AccessToken();
  const minsLeft = Math.round((resolved.expiresAt - Date.now()) / 60_000);
  console.error(`Access token expires in ~${minsLeft} min (${resolved.expiresInSeconds}s)`);

  if (process.argv.includes("--force-refresh")) {
    console.error("Forcing refresh from BEDS24_REFRESH_TOKEN...");
    const token = await forceRefreshBeds24AccessToken();
    console.log(token);
    return;
  }

  console.log(resolved.token);
}
