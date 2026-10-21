import { timingSafeEqual } from "node:crypto";
import { errorResponse, successResponse } from "@/lib/errors";
import { runBackupSync } from "@/lib/backup/sync";

/**
 * Trigger endpoint for the scheduled backup.
 *
 * The schedule itself lives outside this app. The recommended setup is a
 * Supabase cron job that posts here every fifteen minutes. The exact SQL is
 * in `docs/backup-setup.md`; it enables `pg_cron` and `pg_net` on the standby
 * project and then calls `net.http_post` against this URL with the
 * `Authorization: Bearer <BACKUP_SECRET>` header.
 *
 * `GET` is accepted as well so the endpoint can also be driven by a Vercel
 * cron job later on. Vercel sends `Authorization: Bearer $CRON_SECRET`, which
 * is why `CRON_SECRET` is accepted next to `BACKUP_SECRET`.
 *
 * The endpoint is fail-closed: with no secret configured it refuses to run
 * rather than serving the diary to anyone who finds the URL.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Compare two secrets without leaking their contents through timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

async function handle(request: Request): Promise<Response> {
  const expected = (
    process.env.BACKUP_SECRET ??
    process.env.CRON_SECRET ??
    ""
  ).trim();

  if (!expected) {
    return errorResponse(
      "INTERNAL_ERROR",
      "The backup secret is not configured.",
      503,
    );
  }

  const provided = readBearerToken(request);
  if (!provided || !secretsMatch(provided, expected)) {
    return errorResponse("UNAUTHORIZED", "Unauthorized.", 401);
  }

  try {
    const result = await runBackupSync({ trigger: "cron" });
    if (!result.ok) {
      return errorResponse(
        "INTERNAL_ERROR",
        "The backup did not complete. Check the backup log for details.",
        500,
      );
    }
    return successResponse(result);
  } catch (error) {
    console.error("Backup cron run failed:", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "The backup did not complete. Check the backup log for details.",
      500,
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
