import { prisma } from "./prisma";

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfter: number; resetAt: Date };

function rateLimitingEnabled(): boolean {
  return (process.env.RATE_LIMIT_ENABLED ?? "true").toLowerCase() === "true";
}

// Throttle cleanup so expired buckets do not grow unbounded. This only gates
// the cleanup query, never the rate-limit decision itself.
let lastCleanupAt = 0;

async function cleanupExpiredBuckets(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 5 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    await prisma.$executeRaw`
      DELETE FROM "rateLimitBucket"
      WHERE "windowStart" < ${new Date(now - 60 * 60 * 1000)}
    `;
  } catch (error) {
    console.error("Rate limit cleanup failed:", error);
  }
}

/**
 * Atomic fixed-window rate limiter backed by PostgreSQL, so state is shared
 * across serverless instances (no in-memory counters).
 *
 * Failure policy: fail-open. If the database is unreachable the request is
 * allowed through and the failure is logged, so a limiter outage can never
 * permanently lock the legitimate owner out.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!rateLimitingEnabled()) {
    return { ok: true, remaining: limit, resetAt: new Date() };
  }

  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const rows = await prisma.$queryRaw<
      Array<{ count: number; windowStart: Date }>
    >`
      INSERT INTO "rateLimitBucket" ("id", "key", "count", "windowStart")
      VALUES (gen_random_uuid(), ${key}, 1, ${windowStart})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rateLimitBucket"."windowStart" = ${windowStart}
          THEN "rateLimitBucket"."count" + 1
          ELSE 1
        END,
        "windowStart" = CASE
          WHEN "rateLimitBucket"."windowStart" = ${windowStart}
          THEN "rateLimitBucket"."windowStart"
          ELSE EXCLUDED."windowStart"
        END
      RETURNING "count", "windowStart"
    `;

    void cleanupExpiredBuckets();

    const count = Number(rows[0]?.count ?? 1);
    const resetAt = new Date(windowStart.getTime() + windowMs);

    if (count > limit) {
      return {
        ok: false,
        retryAfter: Math.max(
          1,
          Math.ceil((resetAt.getTime() - Date.now()) / 1000),
        ),
        resetAt,
      };
    }

    return { ok: true, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    console.error("Rate limit check failed (failing open):", error);
    return { ok: true, remaining: limit, resetAt: new Date() };
  }
}

/** Build a namespaced, IP-scoped or user-scoped key for a limiter bucket. */
export function rateLimitKey(parts: {
  scope: "login-ip" | "login-account" | "trip-user" | "trip-ip";
  identifier: string;
}): string {
  const id =
    parts.identifier.replace(/[^\w.@-]/g, "").slice(0, 120) || "unknown";
  return `rl:${parts.scope}:${id}`;
}
