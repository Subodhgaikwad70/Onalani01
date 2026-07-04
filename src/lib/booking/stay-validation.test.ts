import { describe, expect, it } from "vitest";
import { validateStayAgainstSlice, type PublicAvailabilityPayload } from "./stay-validation";

function slice(overrides: Partial<PublicAvailabilityPayload> = {}): PublicAvailabilityPayload {
  return {
    available: {
      "2026-07-10": true,
      "2026-07-11": true,
      "2026-07-12": true,
      "2026-07-13": true,
      "2026-07-14": true,
      ...(overrides.available ?? {}),
    },
    min_stay: overrides.min_stay ?? {},
    max_stay: overrides.max_stay ?? {},
    override_status: overrides.override_status ?? {},
    prices_cents: overrides.prices_cents ?? {},
  };
}

describe("validateStayAgainstSlice", () => {
  it("accepts an available stay within listing min/max nights", () => {
    expect(
      validateStayAgainstSlice(slice(), "2026-07-10", "2026-07-12", {
        listingMinNights: 2,
        listingMaxNights: 4,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an unavailable occupied night", () => {
    const result = validateStayAgainstSlice(
      slice({ available: { "2026-07-11": false } }),
      "2026-07-10",
      "2026-07-12",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("2026-07-11");
  });

  it("treats no-check-in and no-check-out overrides as boundary rules", () => {
    const payload = slice({
      override_status: {
        "2026-07-10": "nocheckin",
        "2026-07-12": "nocheckout",
      },
    });

    expect(validateStayAgainstSlice(payload, "2026-07-11", "2026-07-13")).toEqual({
      ok: true,
    });

    expect(validateStayAgainstSlice(payload, "2026-07-10", "2026-07-12").ok).toBe(
      false,
    );
    expect(validateStayAgainstSlice(payload, "2026-07-11", "2026-07-12").ok).toBe(
      false,
    );
  });

  it("enforces cache and listing stay length rules", () => {
    expect(
      validateStayAgainstSlice(
        slice({ min_stay: { "2026-07-10": 3 } }),
        "2026-07-10",
        "2026-07-12",
      ).ok,
    ).toBe(false);

    expect(
      validateStayAgainstSlice(slice(), "2026-07-10", "2026-07-14", {
        listingMaxNights: 3,
      }).ok,
    ).toBe(false);
  });
});
