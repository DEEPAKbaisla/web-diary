/**
 * Shared types for the backup/sync subsystem.
 *
 * Two independent targets are supported:
 *
 * - `google_sheet`   — a human-readable copy in a Google Sheet, written through
 *                      an Apps Script webhook.
 * - `secondary_db`   — a standby PostgreSQL database (Supabase) that mirrors
 *                      the primary so it can be promoted in one step.
 *
 * The orchestrator (`./sync`) is the only place that decides *whether* a target
 * needs work; the target modules only know *how* to do it.
 */

/** The two places a copy of the diary can be written to. */
export type BackupTarget = "google_sheet" | "secondary_db";

/**
 * Outcome of a single target.
 *
 * - `ok`      — the target was written.
 * - `skipped` — the target was already up to date, nothing was sent.
 * - `error`   — the target failed. Other targets are unaffected.
 */
export type BackupTargetStatus = "ok" | "skipped" | "error";

export type BackupTargetResult = {
  target: BackupTarget;
  status: BackupTargetStatus;
  /** Safe, human-readable summary. Never contains secrets or customer data. */
  detail: string;
  /** Number of rows written, when the target reports one. */
  rows?: number;
  /** Which spreadsheet was written, for the Google Sheet target. */
  spreadsheetId?: string;
};

/** Why a sync run was started. Recorded in the standby log for auditing. */
export type BackupTrigger = "cron" | "trip-save" | "manual";

export type BackupSyncResult = {
  /** True when every enabled target ended in `ok` or `skipped`. */
  ok: boolean;
  trigger: BackupTrigger;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Number of trips currently in the primary database. */
  tripCount: number;
  /** True when neither target is configured, so the run was a no-op. */
  notConfigured: boolean;
  targets: BackupTargetResult[];
};

/**
 * A single trip as read from the primary database.
 *
 * Every field is a string because the rows are read with `to_char(...)` in
 * SQL. That keeps the values byte-identical to what is stored in Postgres and
 * completely independent of the server's timezone, so a mirror written from a
 * UTC host matches one written from a host in IST.
 */
export type TripRecord = {
  id: string;
  /** Owner the trip belongs to. Mirrored so the foreign key resolves. */
  userId: string;
  /** `YYYY-MM-DD` */
  tripDate: string;
  fromLocation: string;
  toLocation: string;
  /** Whole rupees, as text. */
  fare: string;
  /** Whole rupees, as text. Extra expenses. */
  kharch: string;
  customerName: string;
  customerPhone: string;
  /** `YYYY-MM-DDTHH:MM:SS.mmmZ` */
  createdAt: string;
  /** `YYYY-MM-DDTHH:MM:SS.mmmZ` */
  updatedAt: string;
};

/** A `user` row, mirrored so that the trip foreign key resolves. */
export type UserRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * An `account` row. The `password` column holds the Argon2id hash, which is
 * why mirroring it keeps the owner's existing password working after a
 * restore. Treat any export of this data as sensitive.
 */
export type AccountRecord = {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scope: string | null;
  password: string | null;
  createdAt: string;
  updatedAt: string;
};
