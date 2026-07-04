import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getBookingCashPaidCents } from "./payment-ledger";

function fakeClient(rows: Array<{ kind: string; amount_cents: number }>) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("getBookingCashPaidCents", () => {
  it("returns charges minus refunds", async () => {
    await expect(
      getBookingCashPaidCents(fakeClient([
        { kind: "charge", amount_cents: 50_000 },
        { kind: "refund", amount_cents: -12_500 },
      ]), "booking-id"),
    ).resolves.toBe(37_500);
  });

  it("never returns a negative refundable balance", async () => {
    await expect(
      getBookingCashPaidCents(fakeClient([
        { kind: "charge", amount_cents: 10_000 },
        { kind: "refund", amount_cents: -15_000 },
      ]), "booking-id"),
    ).resolves.toBe(0);
  });
});
