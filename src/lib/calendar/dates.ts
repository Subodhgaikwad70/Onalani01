/** Half-open range [from, toExclusive) of ISO yyyy-mm-dd dates (UTC calendar days). */
export function* eachCalendarDate(
  from: string,
  toExclusive: string,
): Generator<string> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${toExclusive}T00:00:00Z`);
  const cursor = new Date(start);
  while (cursor < end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** ISO date plus `deltaDays` (UTC calendar arithmetic). */
export function addCalendarDay(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
