/**
 * Timestamp helpers shared by the backup subsystem.
 *
 * Timestamps are read out of Postgres with `to_char(...)`, which returns the
 * value exactly as it is stored. `timestamp without time zone` columns have no
 * timezone attached, so the stored value is a wall-clock string. Keeping it as
 * text (instead of letting the driver turn it into a JS `Date`) means the
 * value does not shift when the same data is written from a host in a
 * different timezone than the one it was read from.
 */

/** The canonical shape used everywhere outside SQL: `2026-10-20T05:30:00.000Z`. */
export type IsoTimestamp = string;

/**
 * Convert the canonical ISO form to the shape Postgres parses unambiguously
 * into a `timestamp` column: `2026-10-20 05:30:00.000`.
 *
 * The trailing `Z` is dropped rather than sent, because Postgres ignores a
 * timezone designator when the target type has no timezone, and dropping it
 * removes any doubt about how the value is interpreted.
 */
export function isoToPgTimestamp(iso: IsoTimestamp): string {
  return iso.replace("T", " ").replace(/Z$/, "");
}

/** Same as {@link isoToPgTimestamp} but passes `null` through unchanged. */
export function isoToPgTimestampOrNull(
  iso: IsoTimestamp | null,
): string | null {
  return iso === null ? null : isoToPgTimestamp(iso);
}
