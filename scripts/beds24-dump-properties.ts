import { readFileSync, existsSync, writeFileSync } from "node:fs";
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
  for (const path of [
    "/properties?includeAllRooms=true",
    "/properties/rooms",
    "/properties/rooms?propertyId=320903",
  ]) {
    const res = await fetch(`${base}${path}`, {
      headers: { token, accept: "application/json" },
    });
    const text = await res.text();
    writeFileSync(
      `scripts/.beds24-probe${path.replace(/\W+/g, "_")}.json`,
      text,
    );
    console.log(path, res.status, text.length, "bytes");
  }
}

main().catch(console.error);
