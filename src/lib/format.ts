/** Shared display helpers for the diary UI. */

/** Whole rupees with the Indian digit grouping, e.g. `₹1,25,000`. */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** A date-only `YYYY-MM-DD` string as a readable day, e.g. `Sat, 21 Oct 2026`. */
export function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A 24-hour clock time, e.g. `10:51`. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The phone numbers stored on one trip, in the order they were typed.
 *
 * A trip may record up to five numbers; they are stored normalised and joined
 * by commas, so this is the display-side split of that single column.
 */
export function storedPhoneNumbers(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
