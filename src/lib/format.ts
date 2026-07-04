export function formatMoney(
  cents: number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse yyyy-mm-dd as a local calendar day (not UTC midnight). */
export function parseCalendarDate(input: string): Date {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(
  input: string | Date,
  locale: string = "en-US",
  options?: Intl.DateTimeFormatOptions,
): string {
  const d =
    typeof input === "string" && DATE_ONLY_RE.test(input)
      ? parseCalendarDate(input)
      : typeof input === "string"
        ? new Date(input)
        : input;
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(d);
}
