import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readRoleFromUser } from "./session";

function userWithRole(role: unknown): User {
  return {
    id: "user-id",
    app_metadata: { role },
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

describe("readRoleFromUser", () => {
  it("returns supported roles from app metadata", () => {
    expect(readRoleFromUser(userWithRole("guest"))).toBe("guest");
    expect(readRoleFromUser(userWithRole("admin"))).toBe("admin");
    expect(readRoleFromUser(userWithRole("super_admin"))).toBe("super_admin");
  });

  it("falls back to guest for missing or unsupported roles", () => {
    expect(readRoleFromUser(null)).toBe("guest");
    expect(readRoleFromUser(userWithRole("owner"))).toBe("guest");
    expect(readRoleFromUser(userWithRole(undefined))).toBe("guest");
  });
});
