/**
 * Beds24 API v2 Stripe channel helpers.
 *
 * Flow (per Beds24 wiki):
 *   1. Create booking in Beds24 → bookId
 *   2. POST /channels/stripe → Checkout Session on property Stripe account
 *   3. Guest pays via Stripe.js redirectToCheckout
 *   4. Charges/refunds via Beds24 Stripe channel endpoints
 *
 * @see https://wiki.beds24.com/index.php/Category:API_V2#Channels_-_Stripe
 */

import { Beds24Error, request as beds24Request } from "@/lib/beds24/client";
import { beds24PostErrorMessage, firstBeds24PostItem } from "@/lib/beds24/post-response";

/** Default Beds24 Connect publishable key documented in the Beds24 wiki. */
export const BEDS24_STRIPE_PUBLISHABLE_KEY_DEFAULT =
  "pk_live_zWSW2ykzZoq4mYcKg9c8jmHS";

export function getBeds24StripePublishableKey(): string {
  return (
    process.env.BEDS24_STRIPE_PUBLISHABLE_KEY ??
    BEDS24_STRIPE_PUBLISHABLE_KEY_DEFAULT
  );
}

/** Full hosted Checkout URL from Beds24 (includes Connect pk in the hash). */
export function resolveBeds24HostedCheckoutUrl(
  checkoutUrl?: string | null,
): string | null {
  const url = checkoutUrl?.trim();
  if (!url) return null;
  // Connect Checkout sessions must use the full URL from Stripe/Beds24 — not /c/pay/{id} alone.
  if (url.includes("#") || url.includes("?")) return url;
  return null;
}

/** @deprecated Use resolveBeds24HostedCheckoutUrl — bare /c/pay/ URLs fail for Connect. */
export function buildBeds24HostedCheckoutUrl(
  _sessionId: string,
  checkoutUrl?: string | null,
): string | null {
  return resolveBeds24HostedCheckoutUrl(checkoutUrl);
}

export type StripeCheckoutLineItem = {
  price_data: {
    currency: string;
    product_data: { name: string; description?: string };
    unit_amount: number;
  };
  quantity: number;
};

export type Beds24StripeCheckoutSession = {
  sessionId: string;
  stripeAccount: string;
  clientSecret?: string | null;
  checkoutUrl?: string | null;
};

export type Beds24StripeCharge = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
  refunded?: boolean;
  amountRefunded?: number;
  latestRefundId?: string;
  cardLast4?: string | null;
  cardBrand?: string | null;
};

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return value as Record<string, unknown>;
}

function digSessionPayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const postItem = firstBeds24PostItem(body);
  const fromNew = postItem?.new;
  const newRow = Array.isArray(fromNew) ? fromNew[0] : fromNew;
  const stripeSession =
    newRow &&
    typeof newRow === "object" &&
    (newRow as Record<string, unknown>).stripeSession;

  const candidates: unknown[] = [
    stripeSession,
    root,
    root.data,
    root.session,
    postItem,
    newRow,
    Array.isArray(root.data) ? root.data[0] : null,
    Array.isArray(root.data) &&
    typeof root.data[0] === "object" &&
    root.data[0] !== null
      ? (root.data[0] as Record<string, unknown>).session
      : null,
  ];

  for (const candidate of candidates) {
    const row = firstRecord(candidate);
    if (!row) continue;
    const sessionId =
      (row.id as string | undefined) ??
      (row.sessionId as string | undefined) ??
      (row.session_id as string | undefined);
    const stripeAccount =
      (row.stripe_account as string | undefined) ??
      (row.stripeAccount as string | undefined) ??
      (row.stripe_acccont as string | undefined);
    if (sessionId && stripeAccount) {
      return {
        ...row,
        id: sessionId,
        stripe_account: stripeAccount,
      };
    }
  }
  return null;
}

function parseCheckoutSession(body: unknown): Beds24StripeCheckoutSession {
  const apiError = beds24PostErrorMessage(body);
  if (apiError) {
    throw new Beds24Error(500, body, `Beds24 Stripe: ${apiError}`);
  }

  const row = digSessionPayload(body);
  if (!row) {
    throw new Beds24Error(500, body, "Beds24 Stripe session response missing session data");
  }

  const sessionId = String(row.id);
  const stripeAccount = String(
    row.stripe_account ?? row.stripeAccount ?? row.stripe_acccont,
  );
  const clientSecret =
    (row.client_secret as string | undefined) ??
    (row.clientSecret as string | undefined) ??
    null;
  const checkoutUrl =
    (row.url as string | undefined) ??
    (row.checkout_url as string | undefined) ??
    null;

  return { sessionId, stripeAccount, clientSecret, checkoutUrl };
}

function parseCharges(body: unknown): Beds24StripeCharge[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.charges)
      ? root.charges
      : Array.isArray(body)
        ? body
        : [];

  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const wrapper = item as Record<string, unknown>;
      const row = (wrapper.stripeCharge ?? wrapper.charge ?? wrapper) as Record<
        string,
        unknown
      >;
      if (!row || typeof row !== "object") return null;
      const id = row.id ?? row.chargeId ?? row.charge_id;
      if (!id) return null;
      const paid = row.paid === true;
      const status = paid
        ? "succeeded"
        : String(row.status ?? (row.captured === true ? "succeeded" : "unknown"));
      const pmd = row.payment_method_details as
        | { card?: { last4?: string; brand?: string } }
        | undefined;
      const card = pmd?.card;
      const refunds = row.refunds as
        | { data?: Array<{ id?: string }> }
        | undefined;
      const charge: Beds24StripeCharge = {
        id: String(id),
        amount: Number(row.amount ?? row.amount_cents ?? 0),
        currency: String(row.currency ?? "usd"),
        status,
        captured: row.captured as boolean | undefined,
        refunded: row.refunded as boolean | undefined,
        amountRefunded: Number(row.amount_refunded ?? 0),
        cardLast4: card?.last4 ?? null,
        cardBrand: card?.brand ?? null,
      };
      if (refunds?.data?.[0]?.id) {
        charge.latestRefundId = String(refunds.data[0].id);
      }
      return charge;
    })
    .filter((c): c is Beds24StripeCharge => c !== null);
}

/**
 * POST /channels/stripe — create a Stripe Checkout session linked to a Beds24 booking.
 */
export async function createBeds24StripeSession(input: {
  bookId: string;
  lineItems: StripeCheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  capture?: boolean;
}): Promise<Beds24StripeCheckoutSession> {
  const payload = [
    {
      action: "createStripeSession",
      bookingId: Number(input.bookId),
      line_items: input.lineItems,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      capture: input.capture ?? true,
    },
  ];

  const body = await beds24Request<unknown>("/channels/stripe", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return parseCheckoutSession(body);
}

/**
 * GET /channels/stripe/charges — list Stripe charges for a Beds24 booking.
 */
export async function getBeds24StripeCharges(
  bookId: string,
): Promise<Beds24StripeCharge[]> {
  const body = await beds24Request<unknown>("/channels/stripe/charges", {
    searchParams: { bookingId: bookId },
  });
  return parseCharges(body);
}

function refundAmountDollars(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

function buildRefundChargePayloads(input: {
  bookId: string;
  chargeId: string;
  chargeAmountCents: number;
  amountCents?: number;
  priorAmountRefunded?: number;
}): unknown[] {
  const bookingId = Number(input.bookId);
  const refundableCents =
    input.chargeAmountCents - (input.priorAmountRefunded ?? 0);
  const refundCents = input.amountCents ?? refundableCents;
  const base = {
    action: "refundCharge",
    bookingId,
    stripeChargeId: input.chargeId,
  };

  const payloads: unknown[] = [];
  const seen = new Set<string>();

  const push = (payload: Record<string, unknown>) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return;
    seen.add(key);
    payloads.push([payload]);
  };

  // Full refund — OpenAPI example includes amount, but Beds24 often expects
  // omitting it when refunding the entire captured charge.
  if (refundCents >= refundableCents) {
    push({ ...base });
  }

  push({ ...base, amount: refundAmountDollars(refundCents) });

  return payloads;
}

function formatBeds24RefundFailure(body: unknown): string {
  const item = firstBeds24PostItem(body);
  if (!item) return "Beds24 Stripe refund rejected";

  const errors = item.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((entry) => {
        if (!entry || typeof entry !== "object") return String(entry);
        const row = entry as Record<string, unknown>;
        const message = row.message;
        if (typeof message === "string" && message.length > 0) return message;
        if (Array.isArray(message) && message.length > 0) {
          return message.map((part) => String(part)).join("; ");
        }
        return JSON.stringify(row);
      })
      .join("; ");
  }

  return beds24PostErrorMessage(body) ?? "Beds24 Stripe refund rejected";
}

function extractRefundId(body: unknown): string | null {
  const item = firstBeds24PostItem(body);
  if (!item || item.success === false) return null;

  const dig = (value: unknown): string | null => {
    const row = firstRecord(value);
    if (!row) return null;

    const stripeRefund = row.stripeRefund ?? row.refund;
    if (stripeRefund && typeof stripeRefund === "object") {
      const refundId = (stripeRefund as Record<string, unknown>).id;
      if (typeof refundId === "string" && refundId.startsWith("re_")) {
        return refundId;
      }
    }

    for (const key of ["refundId", "refund_id", "id"] as const) {
      const candidate = row[key];
      if (typeof candidate === "string" && candidate.startsWith("re_")) {
        return candidate;
      }
    }
    return null;
  };

  const fromNew = item.new;
  const newRows = Array.isArray(fromNew) ? fromNew : fromNew ? [fromNew] : [];
  for (const row of newRows) {
    const id = dig(row);
    if (id) return id;
  }

  return dig(item) ?? dig(item.changes);
}

async function chargeShowsRefund(input: {
  bookId: string;
  chargeId: string;
  amountCents?: number;
  priorAmountRefunded?: number;
}): Promise<string | null> {
  const charges = await getBeds24StripeCharges(input.bookId);
  const charge = charges.find((c) => c.id === input.chargeId);
  if (!charge) return null;

  const refundedAmount = charge.amountRefunded ?? 0;
  const prior = input.priorAmountRefunded ?? 0;
  const increased = refundedAmount > prior;
  const fullyRefunded =
    input.amountCents == null
      ? charge.refunded === true || refundedAmount >= charge.amount
      : refundedAmount - prior >= input.amountCents;

  if (!increased && !fullyRefunded && charge.refunded !== true) {
    return null;
  }

  return charge.latestRefundId ?? `beds24_refund_${input.chargeId}`;
}

/**
 * POST /channels/stripe — refund a charge on the property Stripe account.
 *
 * OpenAPI example uses `action: "refundCharge"` (schema name stripeRefundCharge).
 * Amount is in major currency units (dollars), not cents.
 */
export async function refundBeds24StripeCharge(input: {
  bookId: string;
  chargeId: string;
  amountCents?: number;
}): Promise<{ id: string }> {
  const priorCharges = await getBeds24StripeCharges(input.bookId);
  const prior = priorCharges.find((c) => c.id === input.chargeId);
  if (!prior) {
    throw new Beds24Error(404, null, "Beds24 Stripe charge not found");
  }

  const priorAmountRefunded = prior.amountRefunded ?? 0;
  const payloads = buildRefundChargePayloads({
    bookId: input.bookId,
    chargeId: input.chargeId,
    chargeAmountCents: prior.amount,
    amountCents: input.amountCents,
    priorAmountRefunded,
  });

  let lastBody: unknown = null;
  for (const payload of payloads) {
    const body = await beds24Request<unknown>("/channels/stripe", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    lastBody = body;

    const item = firstBeds24PostItem(body);
    if (item?.success === false) {
      console.warn(
        "[beds24-stripe] refundCharge rejected:",
        formatBeds24RefundFailure(body),
        JSON.stringify(body),
      );
      continue;
    }

    const refundId = extractRefundId(body);
    if (refundId) return { id: refundId };

    const verified = await chargeShowsRefund({
      bookId: input.bookId,
      chargeId: input.chargeId,
      amountCents: input.amountCents,
      priorAmountRefunded,
    });
    if (verified) return { id: verified };
  }

  throw new Beds24Error(
    500,
    lastBody,
    formatBeds24RefundFailure(lastBody),
  );
}
