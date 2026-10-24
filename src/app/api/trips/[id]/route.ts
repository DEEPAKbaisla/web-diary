import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { tripUpdateSchema } from "@/lib/validations";
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

/**
 * Edits one existing trip.
 *
 * Every field is updatable and every field is optional: the driver may change
 * the fare alone, or the phone numbers alone. Ownership is part of the query
 * itself rather than a separate read, so a trip belonging to another user is
 * indistinguishable from one that does not exist.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return validationError("Request body sahi JSON nahi hai.");
  }

  const parsed = tripUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationError(
      "Data sahi nahi hai.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const data = parsed.data;

  try {
    const result = await prisma.trip.updateMany({
      where: { id, userId: session.user.id },
      data: {
        // An absent field is left untouched, which is the whole point of a
        // partial update.
        ...(data.tripDate !== undefined && {
          tripDate: parseDateOnly(data.tripDate),
        }),
        ...(data.fromLocation !== undefined && {
          fromLocation: data.fromLocation,
        }),
        ...(data.toLocation !== undefined && { toLocation: data.toLocation }),
        ...(data.fare !== undefined && { fare: data.fare }),
        ...(data.kharch !== undefined && { kharch: data.kharch }),
        ...(data.customerName !== undefined && {
          customerName: data.customerName,
        }),
        ...(data.customerPhone !== undefined && {
          customerPhone: data.customerPhone,
        }),
      },
    });

    if (result.count === 0) {
      return errorResponse("NOT_FOUND", "Ye trip nahi mili.", 404);
    }

    // Read the row back so the response carries the same shape the diary
    // renders, including the server-set `updatedAt`.
    const updated = await prisma.trip.findUnique({ where: { id } });
    if (!updated) {
      return errorResponse("NOT_FOUND", "Ye trip nahi mili.", 404);
    }

    scheduleBackupAfterTripChange();

    return successResponse(toTripDto(updated));
  } catch (error) {
    return internalError(error, "Failed to update trip");
  }
}
