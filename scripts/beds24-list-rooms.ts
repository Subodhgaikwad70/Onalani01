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

async function main() {
  const token = await getBeds24AccessToken();
  const base = getBeds24ApiBase();
  const res = await fetch(`${base}/properties?includeAllRooms=true`, {
    headers: { token, accept: "application/json" },
  });
  const body = await res.json();
  const props = body.data ?? [];
  for (const p of props) {
    console.log(`Property ${p.id}: ${p.name}`);
    const rooms = p.rooms ?? p.room ?? [];
    const list = Array.isArray(rooms) ? rooms : [rooms];
    for (const r of list) {
      if (r && typeof r === "object") {
        console.log(`  room id=${r.id} name=${r.name ?? r.roomName ?? "?"}`);
      }
    }
  }
  console.log("\nOnalani listing leavenworth-2br expects beds24_room_id=660662");
}

main().catch(console.error);
