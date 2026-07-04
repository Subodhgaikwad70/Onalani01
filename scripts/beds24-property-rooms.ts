/** List rooms for specific Beds24 properties. */
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
  for (const propId of [205666, 320903]) {
    const res = await fetch(`${base}/properties?id=${propId}&includeAllRooms=true`, {
      headers: { token, accept: "application/json" },
    });
    const body = await res.json();
    console.log(`\nProperty ${propId}:`, JSON.stringify(body.data?.[0], null, 2));
  }
  for (const roomId of [660662, 667525]) {
    const res = await fetch(
      `${base}/bookings?id=${roomId === 660662 ? 88489002 : 88489002}`,
      { headers: { token, accept: "application/json" } },
    );
  }
  const bRes = await fetch(`${base}/bookings?id=88489002`, {
    headers: { token, accept: "application/json" },
  });
  console.log("\nBooking 88489002:", JSON.stringify(await bRes.json(), null, 2));
}

main().catch(console.error);
