import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueCreditGrant, type CreditGrantSource } from "@/lib/credits/issue";
import { recordAdminAction } from "@/lib/admin/audit";

const GRANT_SOURCES = [
  "admin_grant",
  "cancellation",
  "recovery",
  "referral",
  "transfer",
  "promo",
] as const;

const GRANT_STATUSES = ["active", "exhausted", "expired", "revoked"] as const;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

const grantBodySchema = z
  .object({
    guest_id: z.string().uuid(),
    amount_cents: z.number().int().min(1),
    lot_id: z.string().uuid().optional().nullable(),
    currency: z.string().length(3).optional(),
    source: z.enum(GRANT_SOURCES).default("admin_grant"),
    expires_at: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    notify_guest: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.lot_id) || Boolean(v.currency), {
    message: "Provide either lot_id or currency",
    path: ["currency"],
  });

/** GET /api/admin/credits/grants — list grants with optional filters. */
export const GET = requireAdmin(async (req) => {
  const url = new URL(req.url);
  const guestId = url.searchParams.get("guest_id");
  const lotId = url.searchParams.get("lot_id");
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const page = boundedInt(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = boundedInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = (page - 1) * limit;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("credit_grants")
    .select(
      "*, credit_lots(id, name), profiles!credit_grants_guest_id_fkey(id, display_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (guestId) query = query.eq("guest_id", guestId);
  if (lotId) query = query.eq("lot_id", lotId);
  if (status && (GRANT_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (source && (GRANT_SOURCES as readonly string[]).includes(source)) {
    query = query.eq("source", source);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return jsonError(500, error.message);
  return Response.json({
    credit_grants: data ?? [],
    page,
    limit,
    total: count ?? 0,
    total_pages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
  });
});

/** POST /api/admin/credits/grants — issue a credit batch to a guest. */
export const POST = requireAdmin(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, grantBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();

  let currency = data.currency?.toUpperCase();
  if (data.lot_id) {
    const { data: lot, error: lotError } = await admin
      .from("credit_lots")
      .select("id, currency")
      .eq("id", data.lot_id)
      .maybeSingle();
    if (lotError) return jsonError(400, lotError.message);
    if (!lot) return jsonError(404, "Credit lot not found");
    currency = lot.currency as string;
  }
  if (!currency) {
    return jsonError(400, "A currency could not be resolved for this grant");
  }

  const { data: guest } = await admin
    .from("profiles")
    .select("id")
    .eq("id", data.guest_id)
    .maybeSingle();
  if (!guest) return jsonError(404, "Guest not found");

  let result: { grantId: string; amountCents: number };
  try {
    result = await issueCreditGrant({
      guestId: data.guest_id,
      amountCents: data.amount_cents,
      currency,
      source: data.source as CreditGrantSource,
      lotId: data.lot_id ?? undefined,
      expiresAt: data.expires_at ?? undefined,
      notes: data.notes ?? null,
      notifyGuest: data.notify_guest,
    });
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "Failed to issue credit grant");
  }

  const { data: grant } = await admin
    .from("credit_grants")
    .select("*")
    .eq("id", result.grantId)
    .single();

  await recordAdminAction({
    adminId: session.user.id,
    action: "credit_grant.issue",
    targetType: "credit_grant",
    targetId: result.grantId,
    after: {
      guest_id: data.guest_id,
      amount_cents: result.amountCents,
      currency,
      source: data.source,
    },
  });

  return Response.json({ credit_grant: grant }, { status: 201 });
});
