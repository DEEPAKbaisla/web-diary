import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import {
  tripCreateSchema,
  tripDateQuerySchema,
  toDateOnly,
} from "@/lib/validations";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/csrf";
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

type TripRow = {
  id: string;
  tripDate: Date;
  fromLocation: string;
  toLocation: string;
  fare: number;
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
  const parsed = tripDateQuerySchema.safeParse({
    date: url.searchParams.get("date"),
  });
  if (!parsed.success) {
    return validationError("Date parameter sahi nahi hai.");
  }

  const date = parsed.data.date;
  const ip = await getClientIp();
  const limited = await enforceTripRateLimit(session.user.id, ip);
  if (limited) {
    return limited;
  }

  const day = parseDateOnly(date);

  try {
    const where = { userId: session.user.id, tripDate: day };
    const [trips, aggregate] = await Promise.all([
      prisma.trip.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.trip.aggregate({ where, _count: true, _sum: { fare: true } }),
    ]);

    return successResponse({
      date,
      count: aggregate._count,
      totalFare: aggregate._sum.fare ?? 0,
      trips: trips.map(toTripDto),
    });
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
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
      },
    });
    return successResponse(toTripDto(created), 201);
  } catch (error) {
    return internalError(error, "Failed to create trip");
  }
}
