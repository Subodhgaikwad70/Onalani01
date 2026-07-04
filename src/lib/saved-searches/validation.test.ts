import { describe, expect, it } from "vitest";
import { savedSearchBodySchema, stableJson } from "./validation";

describe("savedSearchBodySchema", () => {
  it("accepts supported search fields", () => {
    const parsed = savedSearchBodySchema.safeParse({
      name: "Family trip",
      query: {
        location: "Maui",
        checkin: "2026-07-10",
        checkout: "2026-07-14",
        guests: 4,
        amenities: ["pool", "wifi"],
      },
      alerts_enabled: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported or deeply nested query data", () => {
    expect(
      savedSearchBodySchema.safeParse({
        query: { sql: "drop table", location: "Maui" },
      }).success,
    ).toBe(false);

    expect(
      savedSearchBodySchema.safeParse({
        query: { location: { nested: { too: { far: true } } } },
      }).success,
    ).toBe(false);
  });
});

describe("stableJson", () => {
  it("normalizes object key order for duplicate detection", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
  });
});
