/** Helpers for Beds24 v2 standard POST array responses. */

export function firstBeds24PostItem(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) {
    const first = body[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return body as Record<string, unknown>;
}

export function beds24PostErrorMessage(body: unknown): string | null {
  const item = firstBeds24PostItem(body);
  if (!item || item.success !== false) return null;

  const errors = item.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Beds24 rejected the request";
  }

  return errors
    .map((entry) => {
      if (!entry || typeof entry !== "object") return String(entry);
      const row = entry as Record<string, unknown>;
      const message = row.message;
      if (typeof message === "string" && message.length > 0) return message;
      if (Array.isArray(message) && message.length > 0) {
        return message.map((part) => String(part)).join("; ");
      }
      if (typeof row.field === "string") {
        const detail =
          typeof row.action === "string" ? `${row.action}: ` : "";
        return `${detail}${row.field} invalid`;
      }
      return JSON.stringify(row);
    })
    .join("; ");
}
