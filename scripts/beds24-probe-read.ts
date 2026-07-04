/** Probe Beds24 read access for room 660662. */
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
      let v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

async function get(path: string) {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { token, accept: "application/json" },
  });
  const text = await res.text();
  console.log(`\n=== GET ${path} (${res.status}) ===`);
  console.log(text.slice(0, 1200));
}

async function main() {
  await get("/properties?includeAllRooms=true");
  await get("/bookings?roomId=660662&arrival=2027-09-14&departure=2027-09-15&status=request");
  await get("/bookings?roomId=660662&arrivalFrom=2027-09-01&arrivalTo=2027-09-30");
  await get("/bookings?id=88488896&includeInvoiceItems=true");
  await get("/bookings/88488896");
}

main().catch(console.error);
