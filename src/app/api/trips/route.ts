import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import {
  tripCreateSchema,
  tripsQuerySchema,
  monthStart,
  monthEndExclusive,
} from "@/lib/validations";
import {
  successResponse,
  validationError,
  internalError,
  errorResponse,
  forbidden,
  unauthorized,
} from "@/lib/errors";
import { isSameOriginRequest } from "@/lib/csrf";
import {
  MAX_BODY_BYTES,
  enforceTripRateLimit,
  parseDateOnly,
  scheduleBackupAfterTripChange,
  toTripDto,
} from "@/lib/trip-route";

export { maxDuration } from "@/lib/trip-route";

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

  const grouped = new Map<string, ReturnType<typeof toTripDto>[]>();
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

    scheduleBackupAfterTripChange();

    return successResponse(toTripDto(created), 201);
  } catch (error) {
    return internalError(error, "Failed to create trip");
  }
}
