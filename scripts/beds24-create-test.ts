/** Create a test Beds24 booking and dump raw API responses. */
import { readFileSync, existsSync } from "node:fs";
import { getBeds24AccessToken } from "../src/lib/beds24/auth";
import { getBeds24ApiBase } from "../src/lib/beds24/config";
import { createBeds24Booking } from "../src/lib/beds24/client";

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

  const payload = [
    {
      roomId: 660662,
      arrival: "2027-09-14",
      departure: "2027-09-15",
      numAdult: 1,
      numChild: 0,
      firstName: "Test",
      lastName: "Guest",
      email: "guest@onalani.co",
      custom1: "VERIFY-TEST-2",
      status: "request",
      notes: "Onalani verify test 2",
      price: 250,
      invoiceItems: [
        { type: "charge", description: "Lodging — VERIFY-TEST-2", qty: 1, amount: 250 },
      ],
    },
  ];

  const postRes = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: {
      token,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const postText = await postRes.text();
  console.log("POST status:", postRes.status);
  console.log("POST body:", postText);

  let parsed: { new?: unknown; data?: unknown; success?: boolean } = {};
  try {
    const raw = JSON.parse(postText);
    parsed = Array.isArray(raw) ? raw[0] : raw;
  } catch {
    return;
  }

  const newBlock = parsed.new as
    | { id?: number }
    | Array<{ id?: number }>
    | undefined;
  const id =
    (Array.isArray(newBlock) ? newBlock[0]?.id : newBlock?.id) ??
    (parsed.data as Array<{ id?: number }> | undefined)?.[0]?.id;

  if (!id) return;
  console.log("\nParsed id:", id);

  const getRes = await fetch(`${base}/bookings?id=${id}`, {
    headers: { token, accept: "application/json" },
  });
  console.log("\nGET by id:", await getRes.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
