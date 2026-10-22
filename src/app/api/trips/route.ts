import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { runBackupSync } from "@/lib/backup/sync";
import {
  tripCreateSchema,
  tripsQuerySchema,
  monthStart,
  monthEndExclusive,
  toDateOnly,
} from "@/lib/validations";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/csrf";
import type { TripDto } from "@/lib/trip-types";
import {
  unauthorized,
  forbidden,
  validationError,
  rateLimited,
  successResponse,
  internalError,
  errorResponse,
} from "@/lib/errors";

const MAX_BODY_BYTES = 10_000;

/**
 * The background backup runs after the response has been sent, so it needs a
 * little room inside the function's time budget.
 */
export const maxDuration = 60;

type TripRow = {
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

function toTripDto(trip: TripRow) {
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
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Every trip recorded on one day, newest first, plus that day's totals. */
async function buildDayReport(userId: string, date: string) {
  const where = { userId, tripDate: parseDateOnly(date) };

  const [trips, aggregate] = await Promise.all([
    prisma.trip.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.trip.aggregate({ where, _count: true, _sum: { fare: true } }),
  ]);

  return {
    date,
    count: aggregate._count,
    totalFare: aggregate._sum.fare ?? 0,
    trips: trips.map(toTripDto),
  };
}

/**
 * Every trip recorded in one month, grouped by day.
 *
 * The month is matched with a half-open range on the date-only column
 * (`>= first day` and `< first day of the next month`) at UTC midnight, so the
 * filter never drifts with the server's timezone.
 */
async function buildMonthlyReport(userId: string, month: string) {
  const where = {
    userId,
    tripDate: { gte: monthStart(month), lt: monthEndExclusive(month) },
  };

  const trips = await prisma.trip.findMany({
    where,
    orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
  });

  const grouped = new Map<string, TripDto[]>();
  for (const trip of trips) {
    const dto = toTripDto(trip);
    const bucket = grouped.get(dto.tripDate);
    if (bucket) {
      bucket.push(dto);
    } else {
      grouped.set(dto.tripDate, [dto]);
    }
  }

  const days = [...grouped.entries()].map(([date, dayTrips]) => ({
    date,
    count: dayTrips.length,
    totalFare: dayTrips.reduce((sum, trip) => sum + trip.fare, 0),
    trips: dayTrips,
  }));

  return {
    period: month,
    count: trips.length,
    totalFare: trips.reduce((sum, trip) => sum + trip.fare, 0),
    totalKharch: trips.reduce((sum, trip) => sum + trip.kharch, 0),
    days,
  };
}

/**
 * Schedules the background backup after a trip is saved.
 *
 * The trip is already stored by the time this runs, so the driver must never
 * be told the save failed just because the background task could not be
 * scheduled. If scheduling does fail, the trip is still saved and the
 * scheduled backup picks it up on its next run.
 */
function scheduleBackupAfterTripSave() {
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

async function enforceTripRateLimit(userId: string, ip: string) {
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

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const parsed = tripsQuerySchema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });
  if (!parsed.success) {
    return validationError("Date ya month parameter sahi nahi hai.");
  }

  const ip = await getClientIp();
  const limited = await enforceTripRateLimit(session.user.id, ip);
  if (limited) {
    return limited;
  }

  try {
    const { date, month } = parsed.data;
    if (month) {
      return successResponse(await buildMonthlyReport(session.user.id, month));
    }
    if (date) {
      return successResponse(await buildDayReport(session.user.id, date));
    }
    return validationError("Date ya month parameter sahi nahi hai.");
  } catch (error) {
    return internalError(error, "Failed to load trips");
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return unauthorized();
  }

  if (!isSameOriginRequest(request)) {
    return forbidden("Request origin allowed nahi hai.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Request body bohot bada hai.",
      413,
    );
  }

  const ip = await getClientIp();
  const limited = await enforceTripRateLimit(session.user.id, ip);
  if (limited) {
    return limited;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return validationError("Request body sahi JSON nahi hai.");
  }

  const parsed = tripCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationError(
      "Data sahi nahi hai.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  try {
    const created = await prisma.trip.create({
      data: {
        userId: session.user.id,
        tripDate: parseDateOnly(parsed.data.tripDate),
        fromLocation: parsed.data.fromLocation,
        toLocation: parsed.data.toLocation,
        fare: parsed.data.fare,
        kharch: parsed.data.kharch,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
      },
    });

    scheduleBackupAfterTripSave();

    return successResponse(toTripDto(created), 201);
  } catch (error) {
    return internalError(error, "Failed to create trip");
  }
}
