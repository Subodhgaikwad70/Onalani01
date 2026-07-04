/**
 * Thin Beds24 v2 API wrapper.
 *
 * Auth: set BEDS24_API_TOKEN (short-lived) and BEDS24_REFRESH_TOKEN (long-lived).
 * The access token is reused until expiry, then refreshed automatically.
 * Scopes needed for booking sync:
 *   - write:bookings (+ read:bookings)
 *   - write:bookings-personal (guest name/email)
 *   - write:bookings-financial (price/invoice)
 *
 * Reference: https://beds24.com/api/v2  (Swagger)
 */

import {
  forceRefreshBeds24AccessToken,
  getBeds24AccessToken,
} from "@/lib/beds24/auth";
import { getBeds24ApiBase } from "@/lib/beds24/config";
import type { Beds24FinancialPayload } from "@/lib/beds24/booking-financial";
import { replaceBeds24BookingFinancial } from "@/lib/beds24/booking-financial";

class Beds24Error extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "Beds24Error";
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(
  path: string,
  init?: RequestInit & {
    searchParams?: Record<string, string | number | Array<string | number>>;
    /** @internal skip one 401 retry */
    _retried?: boolean;
  },
): Promise<T> {
  const token = await getBeds24AccessToken();

  const url = new URL(getBeds24ApiBase() + path);
  if (init?.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          url.searchParams.append(k, String(item));
        }
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const { _retried, searchParams: _sp, ...fetchInit } = init ?? {};

  const res = await fetch(url.toString(), {
    ...fetchInit,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      token,
      ...(fetchInit.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (res.status === 401 && !_retried && process.env.BEDS24_REFRESH_TOKEN) {
    await forceRefreshBeds24AccessToken();
    return request<T>(path, { ...init, _retried: true });
  }

  if (!res.ok) {
    throw new Beds24Error(
      res.status,
      body,
      `Beds24 ${fetchInit.method ?? "GET"} ${path} failed: ${res.status}`,
    );
  }
  return body as T;
}

export type Beds24CalendarDay = {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  numAvail?: number; // 0 = unavailable (with includeNumAvail)
  price1?: number; // primary nightly price (with includePrices) — used for price_cache
  minStay?: number;
  maxStay?: number;
  /** Beds24 override rule when includeOverride=true */
  override?: string;
  currency?: string;
  /** Present when includePrices; we only persist price1 for cache. */
  price2?: number;
  multiplier?: number;
  channels?: Record<string, unknown>;
};

const CALENDAR_DETAIL_PARAMS = {
  includeNumAvail: "true",
  includeMinStay: "true",
  includeMaxStay: "true",
  includeOverride: "true",
  includePrices: "true",
} as const;

type Beds24CalendarResponse = {
  success: boolean;
  data: Array<{
    propertyId?: number;
    roomId: number;
    calendar: Beds24CalendarDay[];
  }>;
};

async function fetchCalendarMap(
  roomIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, Beds24CalendarDay[]>> {
  if (roomIds.length === 0) return new Map();

  const uniqueIds = [...new Set(roomIds)];
  const data = await request<Beds24CalendarResponse>("/inventory/rooms/calendar", {
    searchParams: {
      roomId: uniqueIds,
      startDate: from,
      endDate: to,
      ...CALENDAR_DETAIL_PARAMS,
    },
  });

  const result = new Map<string, Beds24CalendarDay[]>();
  for (const entry of data.data ?? []) {
    result.set(String(entry.roomId), entry.calendar ?? []);
  }
  return result;
}

/**
 * GET /inventory/rooms/calendar
 *
 * Rich calendar slice (availability, min/max stay, override, prices). We
 * persist `price1` into `price_cache` and map `override` into `override_status`.
 *
 * Pass multiple room IDs to fetch all calendars in one Beds24 request.
 *
 * @see https://beds24.com/api/v2/#/Inventory/get_inventory_rooms_calendar
 */
export async function fetchCalendar(
  roomId: string,
  from: string,
  to: string,
): Promise<Beds24CalendarDay[]>;
export async function fetchCalendar(
  roomIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, Beds24CalendarDay[]>>;
export async function fetchCalendar(
  roomIdOrIds: string | readonly string[],
  from: string,
  to: string,
): Promise<Beds24CalendarDay[] | Map<string, Beds24CalendarDay[]>> {
  const ids =
    typeof roomIdOrIds === "string" ? [roomIdOrIds] : [...roomIdOrIds];
  const map = await fetchCalendarMap(ids, from, to);
  if (typeof roomIdOrIds === "string") {
    return map.get(roomIdOrIds) ?? [];
  }
  return map;
}

/**
 * POST /bookings — create a booking inside Beds24 once we have payment.
 */
export type Beds24BookingStatus =
  | "confirmed"
  | "request"
  | "new"
  | "black"
  | "inquiry";

/** Value shown in the Beds24 booking Referer field (refererEditable). */
export const BEDS24_BOOKING_REFERER = "Onalani";

export async function createBeds24Booking(input: {
  roomId: string;
  arrival: string; // yyyy-mm-dd
  departure: string; // yyyy-mm-dd
  numAdult: number;
  numChild: number;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  notes?: string;
  externalRef?: string;
  /** Beds24 reservation status — use "request" for request-to-book. */
  status?: Beds24BookingStatus;
  financial?: Beds24FinancialPayload | null;
}): Promise<{ id: string }> {
  type Beds24PostItemResponse = {
    success?: boolean;
    new?: Array<{ id?: number }> | { id?: number };
    data?: Array<{ id?: number }>;
    errors?: Array<{ message?: string }>;
  };

  const data = await request<Beds24PostItemResponse[] | Beds24PostItemResponse>(
    "/bookings",
    {
      method: "POST",
      body: JSON.stringify([
        {
          roomId: Number(input.roomId),
          arrival: input.arrival,
          departure: input.departure,
          numAdult: input.numAdult,
          numChild: input.numChild,
          firstName: input.guestFirstName,
          lastName: input.guestLastName,
          email: input.guestEmail,
          notes: input.notes,
          refererEditable: BEDS24_BOOKING_REFERER,
          invoicee: 1,
          custom1: input.externalRef,
          ...(input.status ? { status: input.status } : {}),
          ...(input.financial
            ? {
                price: input.financial.price,
                tax: input.financial.tax,
                invoiceItems: input.financial.invoiceItems,
              }
            : {}),
        },
      ]),
    },
  );

  const item = Array.isArray(data) ? data[0] : data;
  const fromNew = Array.isArray(item?.new) ? item.new[0]?.id : item?.new?.id;
  const id = fromNew ?? item?.data?.[0]?.id;
  if (!id) {
    const detail = item?.errors?.[0]?.message;
    throw new Beds24Error(
      500,
      data,
      detail ? `Beds24 booking failed: ${detail}` : "Beds24 returned no booking id",
    );
  }
  return { id: String(id) };
}

export type Beds24BookingSummary = {
  id: string;
  custom1?: string | null;
  status?: string | null;
  roomId?: number | null;
};

/**
 * GET /bookings — find reservations for a room + stay window.
 */
export async function findBeds24BookingsByStay(input: {
  roomId: string;
  arrival: string;
  departure: string;
}): Promise<Beds24BookingSummary[]> {
  const data = await request<{
    data?: Array<{
      id?: number;
      custom1?: string | null;
      status?: string | null;
      roomId?: number | null;
    }>;
  }>("/bookings", {
    searchParams: {
      roomId: input.roomId,
      arrival: input.arrival,
      departure: input.departure,
      // Omit status — Beds24 defaults to confirmed, request, new, black, inquiry.
    },
  });

  return (data.data ?? [])
    .filter((row) => row.id != null)
    .map((row) => ({
      id: String(row.id),
      custom1: row.custom1 ?? null,
      status: row.status ?? null,
      roomId: row.roomId ?? null,
    }));
}

export async function updateBeds24Booking(input: {
  id: string;
  arrival?: string;
  departure?: string;
  numAdult?: number;
  numChild?: number;
  notes?: string;
  status?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  financial?: Beds24FinancialPayload | null;
}): Promise<void> {
  if (input.financial) {
    await replaceBeds24BookingFinancial(input.id, input.financial);
  }

  const body: Record<string, unknown> = {
    id: Number(input.id),
    ...(input.arrival ? { arrival: input.arrival } : {}),
    ...(input.departure ? { departure: input.departure } : {}),
    ...(input.numAdult != null ? { numAdult: input.numAdult } : {}),
    ...(input.numChild != null ? { numChild: input.numChild } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.guestFirstName ? { firstName: input.guestFirstName } : {}),
    ...(input.guestLastName ? { lastName: input.guestLastName } : {}),
    ...(input.guestEmail ? { email: input.guestEmail } : {}),
  };

  if (Object.keys(body).length <= 1) return;

  await request("/bookings", {
    method: "POST",
    body: JSON.stringify([body]),
  });
}

/**
 * Cancel a Beds24 booking (status → cancelled, then delete if possible).
 */
export async function cancelBeds24Booking(id: string): Promise<void> {
  try {
    await updateBeds24Booking({ id, status: "cancelled" });
  } catch (e) {
    console.warn("[beds24] status cancel failed, trying delete", e);
  }

  try {
    await request("/bookings", {
      method: "DELETE",
      searchParams: { id },
    });
  } catch (e) {
    if (e instanceof Beds24Error && e.status === 404) return;
    console.warn("[beds24] delete booking failed", e);
  }
}

export { Beds24Error };
