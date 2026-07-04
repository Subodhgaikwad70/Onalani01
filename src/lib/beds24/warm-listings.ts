import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  refreshListingsFromBeds24,
  type ListingCacheRefreshTarget,
} from "@/lib/beds24/cache";

const DEFAULT_HORIZON_DAYS = 90;
/** Max room IDs per Beds24 `/inventory/rooms/calendar` request. */
const DEFAULT_ROOM_BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Refreshes availability + price cache for active Beds24-linked listings.
 * Sends one Beds24 calendar request per batch of room IDs.
 */
export async function warmBeds24ListingCaches(options?: {
  horizonDays?: number;
  roomBatchSize?: number;
}): Promise<{ warmed: number; from: string; to: string }> {
  const horizonDays = options?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const roomBatchSize = options?.roomBatchSize ?? DEFAULT_ROOM_BATCH_SIZE;

  const admin = createSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = new Date();
  horizonDate.setUTCDate(horizonDate.getUTCDate() + horizonDays);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const { data: listings } = await admin
    .from("listings")
    .select("id, beds24_room_id, currency")
    .not("beds24_room_id", "is", null)
    .eq("is_active", true);

  const targets: ListingCacheRefreshTarget[] = (listings ?? [])
    .filter((l) => l.beds24_room_id)
    .map((l) => ({
      listingId: l.id,
      beds24RoomId: l.beds24_room_id as string,
      defaultCurrency: l.currency ?? "USD",
    }));

  let warmed = 0;
  for (const batch of chunk(targets, roomBatchSize)) {
    try {
      const { refreshed } = await refreshListingsFromBeds24(batch, {
        from: today,
        to: horizon,
      });
      warmed += refreshed;
    } catch (e) {
      console.error("[beds24/warm-listings] batch refresh failed", e);
    }
  }

  return { warmed, from: today, to: horizon };
}
