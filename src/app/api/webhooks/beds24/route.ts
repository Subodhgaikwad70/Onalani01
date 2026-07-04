import { z } from "zod";
import { jsonError } from "@/lib/auth/session";
import { invalidateRange } from "@/lib/beds24/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const webhookBodySchema = z.object({
  /** Beds24 room id we know — we map it back to a listing.id via beds24_room_id. */
  roomId: z.union([z.string(), z.number()]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/webhooks/beds24
 *
 * Beds24 calls this when bookings or rates change for a given room/range.
 * We invalidate the affected cache rows so the next read repopulates.
 *
 * Authenticate by checking a shared secret in the `x-beds24-secret` header.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-beds24-secret");
  if (!secret || secret !== process.env.BEDS24_WEBHOOK_SECRET) {
    return jsonError(401, "Invalid webhook secret");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }

  const events = Array.isArray(payload) ? payload : [payload];
  const admin = createSupabaseAdmin();

  for (const event of events) {
    const parsed = webhookBodySchema.safeParse(event);
    if (!parsed.success) continue;
    const { roomId, startDate, endDate } = parsed.data;
    const { data: listing } = await admin
      .from("listings")
      .select("id")
      .eq("beds24_room_id", String(roomId))
      .maybeSingle();
    if (!listing) continue;
    await invalidateRange(listing.id, { from: startDate, to: endDate });
  }

  return Response.json({ ok: true });
}
