import { headers } from "next/headers";

/**
 * Best-effort client IP extraction for rate-limit keys. Behind a proxy
 * (Vercel) the first `x-forwarded-for` entry is the client address.
 */
export function extractClientIp(requestHeaders: Headers): string {
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}

export async function getClientIp(): Promise<string> {
  return extractClientIp(await headers());
}
