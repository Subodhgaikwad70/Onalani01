/**
 * Minimal structured logger. Emits JSON lines to stdout so platform log
 * collectors (Vercel, Datadog, Logtail, etc.) can parse them. In dev, prints
 * a more readable single-line view.
 *
 * Usage:
 *   import { log } from "@/lib/observability/logger";
 *   log.info("booking.created", { booking_id, total_cents });
 *   log.error("beds24.refresh_failed", { listing_id }, err);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const isProd = process.env.NODE_ENV === "production";

export function requestIdFromHeaders(headers: Headers): string {
  return (
    headers.get("x-request-id") ??
    headers.get("x-vercel-id") ??
    crypto.randomUUID()
  );
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>, err?: unknown) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(data ?? {}),
    ...(err
      ? {
          error: {
            name: (err as Error).name ?? "Error",
            message: (err as Error).message ?? String(err),
            stack: isProd ? undefined : (err as Error).stack,
          },
        }
      : {}),
  };
  if (isProd) {
    console[level === "debug" ? "log" : level](JSON.stringify(payload));
  } else {
    const tail = data ? ` ${JSON.stringify(data)}` : "";
    const errTail = err ? ` ! ${(err as Error).message ?? err}` : "";
    console[level === "debug" ? "log" : level](`[${level}] ${event}${tail}${errTail}`);
  }
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>, err?: unknown) =>
    emit("warn", event, data, err),
  error: (event: string, data?: Record<string, unknown>, err?: unknown) =>
    emit("error", event, data, err),
};

export async function alertOps(
  event: string,
  data?: Record<string, unknown>,
  err?: unknown,
): Promise<void> {
  log.error(event, { ...(data ?? {}), alert: true }, err);

  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        ts: new Date().toISOString(),
        data: data ?? {},
        error: err
          ? {
              name: (err as Error).name ?? "Error",
              message: (err as Error).message ?? String(err),
            }
          : null,
      }),
    });
  } catch (alertError) {
    log.warn("ops_alert.delivery_failed", { source_event: event }, alertError);
  }
}
