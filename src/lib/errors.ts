/**
 * Consistent JSON response helpers.
 *
 * Error responses never leak database errors, stack traces, credentials or
 * customer data. Detailed diagnostics are logged server-side instead.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return Response.json(
    { success: false, error: { code, message, ...extra } },
    { status },
  );
}

export function unauthorized(message = "Pehle login karein.") {
  return errorResponse("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Aapko is page ka access nahi hai.") {
  return errorResponse("FORBIDDEN", message, 403);
}

export function validationError(message: string, issues?: unknown) {
  return errorResponse("VALIDATION_ERROR", message, 422, issues ? { issues } : undefined);
}

export function rateLimited(retryAfterSeconds: number) {
  return errorResponse(
    "RATE_LIMITED",
    "Bohot zyada requests. Thodi der baad phir koshish karein.",
    429,
    { retryAfter: retryAfterSeconds },
  );
}

export function successResponse<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

/**
 * Map an unknown thrown value to a safe, generic response. Never include the
 * original error message in the response body.
 */
export function internalError(error: unknown, logPrefix = "Request failed") {
  // Detailed diagnostics stay on the server only.
  console.error(logPrefix, error);
  return errorResponse(
    "INTERNAL_ERROR",
    "Kuch galat ho gaya. Baad mein phir koshish karein.",
    500,
  );
}
