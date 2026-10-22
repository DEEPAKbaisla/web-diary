import { buildSheetPayload } from "./sheet-payload";
import { isGoogleSheetConfigured, pushToGoogleSheet } from "./google-sheet";
import {
  assertPrimaryIsNotATestDatabase,
  assertSecondaryIsDistinct,
  describeMirrorError,
  getSecondaryClient,
  isSecondaryConfigured,
  mirrorInto,
} from "./secondary";
import { readPrimarySnapshot } from "./source";
import {
  ensureStateTables,
  LOCK_WAIT_MS,
  logRun,
  readState,
  releaseLock,
  tryAcquireLock,
  updateDatabaseWatermark,
  updateSheetWatermark,
  type BackupState,
} from "./state";
import type {
  BackupSyncResult,
  BackupTarget,
  BackupTargetResult,
  BackupTrigger,
} from "./types";

/**
 * The backup orchestrator.
 *
 * One run copies the diary to every configured target:
 *
 * - the standby PostgreSQL database, and
 * - the Google Sheet.
 *
 * The order is deliberate. The standby is written first so that the Sheet's
 * `Meta` tab can report whether the database copy of the *same* run worked.
 *
 * Two rules keep this safe:
 *
 * 1. The primary database is only ever read. A backup must not be able to
 *    damage the thing it is backing up.
 * 2. A run that finds nothing new does nothing. The watermarks in
 *    `_backup_state` hold the trip count and the newest `updatedAt` seen by
 *    each target, so an unchanged diary costs a single query instead of a
 *    full rewrite of the sheet.
 */

export type RunBackupSyncOptions = {
  trigger: BackupTrigger;
  /** Copy every target even when the watermark says nothing changed. */
  force?: boolean;
  /** Restrict the run to these targets. Defaults to every configured one. */
  targets?: Array<"google_sheet" | "secondary_db">;
};

function isoNow(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Take the run lock, waiting for a busy lock to clear.
 *
 * Waiting rather than skipping matters: the trip-save trigger can fire twice
 * within a second, and the second run may cover a trip the first run had
 * already read past. The waiting run re-reads the watermarks after it gets
 * the lock, so it still copies anything the first run missed.
 */
async function acquireLockWithWait(
  secondary: Parameters<typeof tryAcquireLock>[0],
  owner: string,
): Promise<boolean> {
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    if (await tryAcquireLock(secondary, owner)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(500);
  }
}

/** Write a run-history row without ever failing the run because of it. */
async function safeLog(
  secondary: Parameters<typeof logRun>[0] | null,
  entry: {
    trigger: BackupTrigger;
    target: string;
    status: string;
    detail?: string | null;
  },
): Promise<void> {
  if (!secondary) return;
  try {
    await logRun(secondary, entry);
  } catch (error) {
    console.error(
      "Backup: could not write the run history.",
      error,
    );
  }
}

/**
 * Has this target already seen exactly this data?
 *
 * The pair (trip count, newest `updatedAt`) catches every kind of change:
 * a new trip raises the count, an edited trip moves `updatedAt`, and a
 * deleted trip lowers the count.
 *
 * A target that has never run is always stale. That is what creates the
 * tabs in the first place, and it is what puts the `Meta` tab there, which
 * is how the owner sees that the backup is alive.
 */
function targetIsStale(
  state: BackupState | null,
  target: "sheet" | "db",
  tripCount: number,
  maxUpdatedAt: string | null,
): boolean {
  if (!state) return true;
  if (target === "sheet") {
    if (state.sheetSyncedAt === null) return true;
    return (
      state.sheetTripCount !== tripCount ||
      state.sheetMaxUpdatedAt !== maxUpdatedAt
    );
  }
  if (state.dbSyncedAt === null) return true;
  return (
    state.dbTripCount !== tripCount || state.dbMaxUpdatedAt !== maxUpdatedAt
  );
}

/**
 * Run the backup.
 *
 * Never throws: every failure is reported in the returned result so the
 * caller can log it and decide what to do.
 */
export async function runBackupSync(
  options: RunBackupSyncOptions,
): Promise<BackupSyncResult> {
  const startedAt = new Date();
  const trigger = options.trigger;
  const wanted = options.targets;
  const sheetEnabled =
    isGoogleSheetConfigured() && (wanted?.includes("google_sheet") ?? true);
  const databaseEnabled =
    isSecondaryConfigured() && (wanted?.includes("secondary_db") ?? true);

  const finish = (
    targets: BackupTargetResult[],
    tripCount: number,
    notConfigured = false,
  ): BackupSyncResult => {
    const finishedAt = new Date();
    return {
      ok: targets.every((target) => target.status !== "error"),
      trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      tripCount,
      notConfigured,
      targets,
    };
  };

  if (!sheetEnabled && !databaseEnabled) {
    return finish([], 0, true);
  }

  // A test database must never reach a backup target. The automated suite
  // runs against a throwaway database, and a stray environment variable would
  // otherwise replace the owner's real diary in the standby and the Google
  // Sheet with test data.
  try {
    assertPrimaryIsNotATestDatabase();
  } catch (error) {
    console.error("Backup refused to run:", error);
    const refused: BackupTarget[] = [];
    if (sheetEnabled) refused.push("google_sheet");
    if (databaseEnabled) refused.push("secondary_db");
    return finish(
      refused.map((target) => ({
        target,
        status: "error" as const,
        detail:
          "The primary database looks like a test database, so nothing was copied.",
      })),
      0,
    );
  }

  const lockOwner = `${trigger}-${process.pid}-${crypto.randomUUID()}`;
  const targets: BackupTargetResult[] = [];

  let secondary: Awaited<ReturnType<typeof getSecondaryClient>> | null = null;
  let state: BackupState | null = null;
  let locked = false;

  if (databaseEnabled) {
    try {
      // Checked up front so a copy/paste mistake in the environment file is
      // reported as exactly that, rather than as a generic outage.
      assertSecondaryIsDistinct();
      secondary = getSecondaryClient();
      await ensureStateTables(secondary);
    } catch (error) {
      // The standby is unreachable. The Sheet copy must still work, so the run
      // continues without a lock and without a watermark. The full error stays
      // in the server log; the safe description is what reaches the sheet.
      console.error("Backup: the standby database is unavailable.", error);
      secondary = null;
    }
  }

  if (secondary) {
    try {
      locked = await acquireLockWithWait(secondary, lockOwner);
    } catch (error) {
      console.error("Backup: could not take the run lock.", error);
      secondary = null;
    }

    if (!locked && secondary) {
      await safeLog(secondary, {
        trigger,
        target: "all",
        status: "skipped",
        detail: "Another backup run was still in progress.",
      });
      return finish(
        [
          {
            target: "secondary_db",
            status: "skipped",
            detail: "Another backup run was still in progress.",
          },
        ],
        0,
      );
    }
  }

  try {
    if (secondary && locked) {
      // Re-read after taking the lock: another run may have advanced the
      // watermarks while we were waiting for it.
      try {
        state = await readState(secondary);
      } catch (error) {
        console.error("Backup: could not read the backup state.", error);
      }
    }

    let snapshot;
    try {
      snapshot = await readPrimarySnapshot({
        includeCredentials: databaseEnabled && secondary !== null,
      });
    } catch (error) {
      const message = "The primary database could not be read. See the server log for details.";
      console.error("Backup: could not read the primary database.", error);

      if (databaseEnabled) {
        targets.push({
          target: "secondary_db",
          status: "error",
          detail: message,
        });
        await safeLog(secondary, {
          trigger,
          target: "secondary_db",
          status: "error",
          detail: message,
        });
      }
      if (sheetEnabled) {
        targets.push({ target: "google_sheet", status: "error", detail: message });
      }
      return finish(targets, 0);
    }

    let databaseSyncStatus = "not configured";
    let databaseSyncError: string | null = null;

    // --- standby database -------------------------------------------------
    if (databaseEnabled) {
      if (!secondary) {
        databaseSyncStatus = "error";
        databaseSyncError = "The standby database is unreachable.";
        targets.push({
          target: "secondary_db",
          status: "error",
          detail: databaseSyncError,
        });
      } else if (
        !options.force &&
        !targetIsStale(
          state,
          "db",
          snapshot.tripCount,
          snapshot.maxUpdatedAt,
        )
      ) {
        databaseSyncStatus = "skipped";
        targets.push({
          target: "secondary_db",
          status: "skipped",
          detail: "The standby database is already up to date.",
        });
      } else {
        try {
          const mirrored = await mirrorInto(secondary, {
            users: snapshot.users,
            accounts: snapshot.accounts,
            trips: snapshot.trips,
          });
          await updateDatabaseWatermark(secondary, {
            tripCount: snapshot.tripCount,
            maxUpdatedAt: snapshot.maxUpdatedAt,
          });
          databaseSyncStatus = "ok";
          targets.push({
            target: "secondary_db",
            status: "ok",
            detail: `Copied ${mirrored.trips} trips to the standby database.`,
            rows: mirrored.trips,
          });
          await safeLog(secondary, {
            trigger,
            target: "secondary_db",
            status: "ok",
            detail: `${mirrored.trips} trips copied.`,
          });
        } catch (error) {
          databaseSyncStatus = "error";
          databaseSyncError = describeMirrorError(error);
          console.error("Backup: could not write to the standby database.", error);
          targets.push({
            target: "secondary_db",
            status: "error",
            detail: databaseSyncError,
          });
          await safeLog(secondary, {
            trigger,
            target: "secondary_db",
            status: "error",
            detail: databaseSyncError,
          });
        }
      }
    }

    // --- google sheet -----------------------------------------------------
    if (sheetEnabled) {
      if (
        !options.force &&
        !targetIsStale(
          state,
          "sheet",
          snapshot.tripCount,
          snapshot.maxUpdatedAt,
        )
      ) {
        targets.push({
          target: "google_sheet",
          status: "skipped",
          detail: "The Google Sheet is already up to date.",
        });
      } else {
        try {
          const payload = buildSheetPayload({
            trips: snapshot.trips,
            syncedAt: isoNow(),
            databaseSync: databaseSyncStatus,
            databaseSyncError,
          });
          const pushed = await pushToGoogleSheet(payload);
          if (secondary) {
            await updateSheetWatermark(secondary, {
              tripCount: snapshot.tripCount,
              maxUpdatedAt: snapshot.maxUpdatedAt,
            });
          }
          targets.push({
            target: "google_sheet",
            status: "ok",
            detail: `Wrote ${snapshot.tripCount} trips to the Google Sheet.`,
            rows: pushed.rows,
            spreadsheetId: pushed.spreadsheetId || undefined,
          });
          await safeLog(secondary, {
            trigger,
            target: "google_sheet",
            status: "ok",
            detail: `${snapshot.tripCount} trips written.`,
          });
        } catch (error) {
          const message = describeMirrorError(error);
          console.error("Backup: could not write to the Google Sheet.", error);
          targets.push({
            target: "google_sheet",
            status: "error",
            detail: message,
          });
          await safeLog(secondary, {
            trigger,
            target: "google_sheet",
            status: "error",
            detail: message,
          });
        }
      }
    }

    return finish(targets, snapshot.tripCount);
  } finally {
    if (secondary && locked) {
      try {
        await releaseLock(secondary, lockOwner);
      } catch (error) {
        console.error("Backup: could not release the run lock.", error);
      }
    }
  }
}
