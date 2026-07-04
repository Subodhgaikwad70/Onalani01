import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import {
  bookingLabelFromEmbed,
  grantLabel,
  mergeCreditHistory,
  type GuestCreditHistoryEntry,
  type GuestCreditsResponse,
} from "@/lib/credits/guest-credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HISTORY_DEFAULT_LIMIT = 10;
const HISTORY_MAX_LIMIT = 50;
type CreditLotEmbed = { name: string | null };
type CreditGrantEmbed = {
  credit_lots?: CreditLotEmbed | CreditLotEmbed[] | null;
};
type CreditHistoryBooking = NonNullable<Parameters<typeof bookingLabelFromEmbed>[0]> & {
  id?: string | null;
  currency?: string | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeGrant(raw: unknown): { credit_lots?: CreditLotEmbed | null } {
  const grant = first(raw as CreditGrantEmbed | CreditGrantEmbed[] | null);
  return { credit_lots: first(grant?.credit_lots) };
}

function normalizeBooking(raw: unknown): CreditHistoryBooking | null {
  return first(raw as CreditHistoryBooking | CreditHistoryBooking[] | null);
}

function boundedInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

/** GET /api/guests/me/credits — grants, balances, and utilization history. */
export const GET = requireAuth(async (req, _ctx, session) => {
  const url = new URL(req.url);
  const include = new Set(
    (url.searchParams.get("include") ?? "balances,grants,history")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const includeGrants = include.has("grants");
  const includeHistory = include.has("history");
  const historyPage = boundedInt(
    url.searchParams.get("history_page"),
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const historyLimit = boundedInt(
    url.searchParams.get("history_limit"),
    HISTORY_DEFAULT_LIMIT,
    HISTORY_MAX_LIMIT,
  );
  const historyOffset = (historyPage - 1) * historyLimit;
  const historyFetchEnd = historyOffset + historyLimit - 1;
  const supabase = await createSupabaseServerClient();

  const [grantsRes, redemptionsRes, refundsRes] = await Promise.all([
    supabase
      .from("credit_grants")
      .select("id, original_cents, remaining_cents, currency, expires_at, status, credit_lots(name)")
      .eq("guest_id", session.user.id)
      .eq("status", "active")
      .gt("remaining_cents", 0)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    includeHistory
      ? supabase
          .from("credit_redemptions")
          .select(
            `
        id,
        amount_cents,
        created_at,
        credit_grants!inner(credit_lots(name)),
        bookings!inner(
          id,
          code,
          currency,
          check_in,
          check_out,
          listings(unit_type, properties(property_name))
        )
      `,
            { count: "exact" },
          )
          .eq("credit_grants.guest_id", session.user.id)
          .order("created_at", { ascending: false })
          .range(0, historyFetchEnd)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    includeHistory
      ? supabase
          .from("payment_history")
          .select(
            `
        id,
        amount_cents,
        currency,
        created_at,
        bookings(id, code, listings(unit_type, properties(property_name)))
      `,
            { count: "exact" },
          )
          .eq("guest_id", session.user.id)
          .eq("kind", "credit_refund")
          .order("created_at", { ascending: false })
          .range(0, historyFetchEnd)
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);

  if (grantsRes.error) return jsonError(500, grantsRes.error.message);
  if (redemptionsRes.error) return jsonError(500, redemptionsRes.error.message);
  if (refundsRes.error) return jsonError(500, refundsRes.error.message);

  const grants = grantsRes.data ?? [];
  const totals = new Map<string, number>();
  for (const grant of grants) {
    const cur = grant.currency as string;
    totals.set(cur, (totals.get(cur) ?? 0) + (grant.remaining_cents as number));
  }

  const applied: GuestCreditHistoryEntry[] = (redemptionsRes.data ?? []).map((row) => {
    const grant = normalizeGrant(row.credit_grants);
    const booking = normalizeBooking(row.bookings);
    return {
      id: `redemption-${row.id}`,
      type: "applied" as const,
      amount_cents: row.amount_cents as number,
      currency: booking?.currency ?? "USD",
      created_at: row.created_at as string,
      booking_id: booking?.id ?? null,
      booking_code: booking?.code ?? null,
      booking_label: bookingLabelFromEmbed(booking),
      grant_label: grantLabel(grant),
    };
  });

  const refunded: GuestCreditHistoryEntry[] = (refundsRes.data ?? []).map((row) => {
    const booking = normalizeBooking(row.bookings);
    return {
      id: `refund-${row.id}`,
      type: "refunded" as const,
      amount_cents: Math.abs(row.amount_cents as number),
      currency: row.currency as string,
      created_at: row.created_at as string,
      booking_id: booking?.id ?? null,
      booking_code: booking?.code ?? null,
      booking_label: bookingLabelFromEmbed(booking),
      grant_label: null,
    };
  });

  const history = includeHistory
    ? mergeCreditHistory(applied, refunded).slice(
        historyOffset,
        historyOffset + historyLimit,
      )
    : [];
  const historyTotal = (redemptionsRes.count ?? 0) + (refundsRes.count ?? 0);

  const body: GuestCreditsResponse = {
    grants: includeGrants ? (grants as unknown as GuestCreditsResponse["grants"]) : [],
    balances: Object.fromEntries(totals),
    history,
    history_page: historyPage,
    history_limit: historyLimit,
    history_total: historyTotal,
    history_total_pages: Math.max(1, Math.ceil(historyTotal / historyLimit)),
  };

  return Response.json(body);
});
