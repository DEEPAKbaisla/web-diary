import { after } from "next/server";
import { runBackupSync } from "@/lib/backup/sync";
import { toDateOnly } from "@/lib/validations";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/errors";
import type { TripDto } from "@/lib/trip-types";

/**
 * Helpers shared by the trips route handlers.
 *
 * `POST /api/trips` and `PATCH /api/trips/[id]` must answer identically to
 * the same conditions — the same body limit, the same rate limit, the same
 * trip shape — so the rules live here once instead of drifting apart in two
 * route files.
 */

export const MAX_BODY_BYTES = 10_000;

/**
 * The background backup runs after the response has been sent, so it needs a
 * little room inside the function's time budget.
 */
export const maxDuration = 60;

export type TripRow = {
  id: string;
  tripDate: Date;
  fromLocation: string;
  toLocation: string;
  fare: number;
  kharch: number;
  customerName: string;
  customerPhone: string;
  createdAt: Date;
};

export function toTripDto(trip: TripRow): TripDto {
  return {
    id: trip.id,
    tripDate: toDateOnly(trip.tripDate),
    fromLocation: trip.fromLocation,
    toLocation: trip.toLocation,
    fare: trip.fare,
    kharch: trip.kharch,
    customerName: trip.customerName,
    customerPhone: trip.customerPhone,
    createdAt: trip.createdAt.toISOString(),
  };
}

/** Parse a `YYYY-MM-DD` string into a UTC-midnight Date for `@db.Date` columns. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Schedules the background backup after a trip is saved or edited.
 *
 * The trip is already stored by the time this runs, so the driver must never
 * be told the save failed just because the background task could not be
 * scheduled. If scheduling does fail, the trip is still saved and the
 * scheduled backup picks it up on its next run.
 */
export function scheduleBackupAfterTripChange() {
  try {
    // Copy the diary to the backup targets in the background. The response is
    // already on its way to the driver, so the save stays instant, and the
    // standby database and the Google Sheet are never more than a few seconds
    // behind a new trip. When no backup target is configured this is a no-op.
    after(async () => {
      try {
        await runBackupSync({ trigger: "trip-save" });
      } catch (error) {
        console.error("Backup after trip save failed:", error);
      }
    });
  } catch (error) {
    console.error("Could not schedule the backup after trip save:", error);
  }
}

/** Rejects a caller that exceeds the per-user and per-IP request budget. */
export async function enforceTripRateLimit(userId: string, ip: string) {
  const max =
    Number.parseInt(process.env.TRIP_RATE_LIMIT_MAX ?? "", 10) || 120;
  const windowSeconds =
    Number.parseInt(process.env.TRIP_RATE_LIMIT_WINDOW_SECONDS ?? "", 10) ||
    60;

  const [userLimit, ipLimit] = await Promise.all([
    checkRateLimit(
      rateLimitKey({ scope: "trip-user", identifier: userId }),
      max,
      windowSeconds,
    ),
    checkRateLimit(
      rateLimitKey({ scope: "trip-ip", identifier: ip }),
      max,
      windowSeconds,
    ),
  ]);

  if (!userLimit.ok || !ipLimit.ok) {
    const retryAfter = Math.max(
      userLimit.ok ? 0 : userLimit.retryAfter,
      ipLimit.ok ? 0 : ipLimit.retryAfter,
    );
    return rateLimited(retryAfter);
  }
  return null;
}
