/** Probe a Beds24 booking + property Stripe config. */
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

const bookId = process.argv[2] ?? "88490917";

async function get(path: string) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { token, accept: "application/json" },
  });
  const text = await res.text();
  console.log(`\nGET ${path} → ${res.status}`);
  console.log(text.slice(0, 4000));
}

async function main() {
  await get(`/bookings?id=${bookId}`);
  await get(`/bookings?id=${bookId}&includeInvoiceItems=true`);
  await get(`/properties?id=205666`);
}

main().catch(console.error);
