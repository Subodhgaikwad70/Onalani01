/** Read-only: show Beds24 token scopes (no writes). */
import { readFileSync, existsSync } from "node:fs";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";

function loadEnv() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}
loadEnv();

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}/authentication/details`, {
    headers: { token, accept: "application/json" },
  });
  const text = await res.text();
  console.log(res.status, text);
}

main().catch(console.error);
