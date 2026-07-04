import { readFileSync, existsSync } from "node:fs";
import { fetchCalendar } from "../src/lib/beds24/client";

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
  const roomId = process.argv[2] ?? "660662";
  const from = process.argv[3] ?? "2027-09-14";
  const to = process.argv[4] ?? "2027-09-18";

  const days = await fetchCalendar(roomId, from, to);
  console.log(JSON.stringify(days, null, 2));
}

main().catch(console.error);
