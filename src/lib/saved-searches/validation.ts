import { z } from "zod";

export const MAX_SAVED_SEARCHES = 25;
const MAX_QUERY_JSON_BYTES = 4000;
const MAX_QUERY_DEPTH = 3;

const ALLOWED_QUERY_KEYS = new Set([
  "q",
  "location",
  "checkin",
  "checkout",
  "from",
  "to",
  "guests",
  "adults",
  "children",
  "infants",
  "pets",
  "bbox",
  "min_price",
  "max_price",
  "amenities",
  "category",
  "instant_book",
]);

function queryDepth(value: unknown): number {
  if (value == null || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    return 1 + Math.max(0, ...value.map(queryDepth));
  }
  return (
    1 +
    Math.max(
      0,
      ...Object.values(value as Record<string, unknown>).map(queryDepth),
    )
  );
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const savedSearchBodySchema = z.object({
  name: z.string().max(120).optional().nullable(),
  query: z.record(z.string(), z.unknown()).superRefine((query, ctx) => {
    const keys = Object.keys(query);
    const unknownKeys = keys.filter((key) => !ALLOWED_QUERY_KEYS.has(key));
    if (unknownKeys.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Unsupported search fields: ${unknownKeys.join(", ")}`,
      });
    }
    if (Buffer.byteLength(JSON.stringify(query), "utf8") > MAX_QUERY_JSON_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "Saved search query is too large",
      });
    }
    if (queryDepth(query) > MAX_QUERY_DEPTH) {
      ctx.addIssue({
        code: "custom",
        message: "Saved search query is too deeply nested",
      });
    }
  }),
  alerts_enabled: z.boolean().default(false),
});
