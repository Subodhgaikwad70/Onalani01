"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuestWishlist } from "@/lib/wishlists/types";

export const WISHLISTS_QUERY_KEY = ["wishlists"] as const;
/** @deprecated Use WISHLISTS_QUERY_KEY */
export const WISHLISTS_ACCOUNT_QUERY_KEY = WISHLISTS_QUERY_KEY;

async function fetchGuestWishlists(): Promise<GuestWishlist[]> {
  const res = await fetch("/api/wishlists", { credentials: "include" });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error("Could not load wishlists");
  const json = (await res.json()) as { wishlists: GuestWishlist[] };
  return json.wishlists ?? [];
}

export function useGuestWishlists(enabled = true) {
  return useQuery({
    queryKey: WISHLISTS_QUERY_KEY,
    queryFn: fetchGuestWishlists,
    enabled,
  });
}

export function useInvalidateGuestWishlists() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: WISHLISTS_ACCOUNT_QUERY_KEY });
  };
}
