import { Prisma, PrismaClient } from "../../generated/prisma/client";

/**
 * Bookkeeping for the backup subsystem, stored on the standby database.
 *
 * Two small tables are created on demand:
 *
 * - `_backup_state`   — a single row holding the run lock and the per-target
 *                       watermarks (how many trips were last copied and the
 *                       newest `updatedAt` at that moment).
 * - `_backup_sync_log` — an append-only history of every run, so it is always
 *                       possible to answer "when did my backup last work?".
 *
 * The watermarks let an unchanged diary cost a single cheap query instead of
 * a full rewrite. The lock keeps two overlapping runs from fighting over the
 * same targets.
 */

/** A lock older than this is considered abandoned and may be taken over. */
export const LOCK_STALE_AFTER_SECONDS = 120;

/** How long a run waits for a busy lock before giving up. */
export const LOCK_WAIT_MS = 30_000;

export type BackupState = {
  sheetTripCount: number;
  sheetMaxUpdatedAt: string | null;
  sheetSyncedAt: Date | null;
  dbTripCount: number;
  dbMaxUpdatedAt: string | null;
  dbSyncedAt: Date | null;
};

let tablesReady = false;

/** Create the bookkeeping tables if they are not there yet. */
export async function ensureStateTables(secondary: PrismaClient): Promise<void> {
  if (tablesReady) return;
  await secondary.$executeRaw`
    CREATE TABLE IF NOT EXISTS "_backup_state" (
      "id"                   INTEGER PRIMARY KEY,
      "locked_at"            TIMESTAMPTZ,
      "lock_owner"           TEXT,
      "sheet_trip_count"     INTEGER NOT NULL DEFAULT 0,
      "sheet_max_updated_at" TEXT,
      "sheet_synced_at"      TIMESTAMPTZ,
      "db_trip_count"        INTEGER NOT NULL DEFAULT 0,
      "db_max_updated_at"    TEXT,
      "db_synced_at"         TIMESTAMPTZ
    )
  `;
  await secondary.$executeRaw`
    CREATE TABLE IF NOT EXISTS "_backup_sync_log" (
      "id"             BIGSERIAL PRIMARY KEY,
      "started_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "finished_at"    TIMESTAMPTZ,
      "trigger_source" TEXT NOT NULL,
      "target"         TEXT NOT NULL,
      "status"         TEXT NOT NULL,
      "detail"         TEXT
    )
  `;
  await secondary.$executeRaw`
    INSERT INTO "_backup_state" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING
  `;

  // These two tables are created at runtime, so they must be protected the
  // moment they exist rather than only after `npm run db:harden:secondary`.
  //
  // On Supabase a new table in `public` is handed to the `anon` and
  // `authenticated` roles by default, and the publishable key maps to `anon`.
  // Left alone, the backup's own bookkeeping would be readable over the REST
  // API by anyone holding that key.
  //
  // Row Level Security does not get in the way of the backup itself: the
  // standby is written by the table owner.
  await secondary.$executeRaw`
    ALTER TABLE "_backup_state" ENABLE ROW LEVEL SECURITY;
  `;
  await secondary.$executeRaw`
    ALTER TABLE "_backup_sync_log" ENABLE ROW LEVEL SECURITY;
  `;
  await secondary.$executeRaw`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE "_backup_state" FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE "_backup_sync_log" FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE "_backup_state" FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE "_backup_sync_log" FROM authenticated';
      END IF;
    END $$;
  `;

  tablesReady = true;
}

/** Forget that the tables exist (used by the CLI scripts between runs). */
export function resetStateTableCache(): void {
  tablesReady = false;
}

/** Read the current watermarks. */
export async function readState(secondary: PrismaClient): Promise<BackupState> {
  const rows = await secondary.$queryRaw<
    Array<{
      sheetTripCount: number;
      sheetMaxUpdatedAt: string | null;
      sheetSyncedAt: Date | null;
      dbTripCount: number;
      dbMaxUpdatedAt: string | null;
      dbSyncedAt: Date | null;
    }>
  >`
    SELECT
      "sheet_trip_count"    AS "sheetTripCount",
      "sheet_max_updated_at" AS "sheetMaxUpdatedAt",
      "sheet_synced_at"     AS "sheetSyncedAt",
      "db_trip_count"       AS "dbTripCount",
      "db_max_updated_at"   AS "dbMaxUpdatedAt",
      "db_synced_at"        AS "dbSyncedAt"
    FROM "_backup_state"
    WHERE "id" = 1
  `;

  const row = rows[0];
  return {
    sheetTripCount: Number(row?.sheetTripCount ?? 0),
    sheetMaxUpdatedAt: row?.sheetMaxUpdatedAt ?? null,
    sheetSyncedAt: row?.sheetSyncedAt ?? null,
    dbTripCount: Number(row?.dbTripCount ?? 0),
    dbMaxUpdatedAt: row?.dbMaxUpdatedAt ?? null,
    dbSyncedAt: row?.dbSyncedAt ?? null,
  };
}

/**
 * Try to take the run lock.
 *
 * Returns `false` when another run currently holds it. A lock that has been
 * held longer than `staleAfterSeconds` is treated as abandoned, so a crashed
 * run cannot wedge the schedule forever.
 */
export async function tryAcquireLock(
  secondary: PrismaClient,
  owner: string,
  staleAfterSeconds: number = LOCK_STALE_AFTER_SECONDS,
): Promise<boolean> {
  const rows = await secondary.$queryRaw<Array<{ id: number }>>`
    UPDATE "_backup_state"
       SET "locked_at" = now(),
           "lock_owner" = ${owner}::text
     WHERE "id" = 1
       AND (
         "locked_at" IS NULL
         OR "locked_at" < now() - make_interval(secs => ${staleAfterSeconds}::int)
       )
    RETURNING "id"
  `;
  return rows.length > 0;
}

/** Give the run lock back. */
export async function releaseLock(
  secondary: PrismaClient,
  owner: string,
): Promise<void> {
  await secondary.$executeRaw(Prisma.sql`
    UPDATE "_backup_state"
       SET "locked_at" = NULL,
           "lock_owner" = NULL
     WHERE "id" = 1
       AND "lock_owner" = ${owner}::text
  `);
}

export type Watermark = {
  tripCount: number;
  maxUpdatedAt: string | null;
};

/** Record that the Google Sheet now holds this many trips. */
export async function updateSheetWatermark(
  secondary: PrismaClient,
  watermark: Watermark,
): Promise<void> {
  await secondary.$executeRaw(Prisma.sql`
    UPDATE "_backup_state"
       SET "sheet_trip_count" = ${watermark.tripCount}::int,
           "sheet_max_updated_at" = ${watermark.maxUpdatedAt}::text,
           "sheet_synced_at" = now()
     WHERE "id" = 1
  `);
}

/** Record that the standby now holds this many trips. */
export async function updateDatabaseWatermark(
  secondary: PrismaClient,
  watermark: Watermark,
): Promise<void> {
  await secondary.$executeRaw(Prisma.sql`
    UPDATE "_backup_state"
       SET "db_trip_count" = ${watermark.tripCount}::int,
           "db_max_updated_at" = ${watermark.maxUpdatedAt}::text,
           "db_synced_at" = now()
     WHERE "id" = 1
  `);
}

/** Append a row to the run history. */
export async function logRun(
  secondary: PrismaClient,
  entry: {
    trigger: string;
    target: string;
    status: string;
    detail?: string | null;
  },
): Promise<void> {
  await secondary.$executeRaw(Prisma.sql`
    INSERT INTO "_backup_sync_log"
      ("started_at", "finished_at", "trigger_source", "target", "status", "detail")
    VALUES (now(), now(), ${entry.trigger}::text, ${entry.target}::text, ${entry.status}::text, ${entry.detail ?? null}::text)
  `);
}
