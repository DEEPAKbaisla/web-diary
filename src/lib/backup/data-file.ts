import { summarizeTrips } from "./sheet-payload";
import type { AccountRecord, TripRecord, UserRecord } from "./types";

/**
 * The file format used by the portable backup.
 *
 * The JSON file is the provider-agnostic safety net: it can be dropped into
 * Google Drive, a private repository or a USB stick and restored into any
 * PostgreSQL database, including a brand new one that has never heard of this
 * project.
 *
 * The schema is not part of the file. It lives in git, in
 * `prisma/migrations`, so restoring is: apply the migrations, then import the
 * data.
 */

export const DATA_FILE_VERSION = 1;

export type DiaryBackupFile = {
  /** Format version, so an old file can be recognised later. */
  version: number;
  /** ISO timestamp of the export. */
  exportedAt: string;
  tripCount: number;
  totalFare: number;
  /** True when the credential rows (including the password hash) were left out. */
  credentialsOmitted: boolean;
  users: UserRecord[];
  accounts: AccountRecord[];
  trips: TripRecord[];
};

export type BuildBackupFileInput = {
  exportedAt: string;
  users: UserRecord[];
  accounts: AccountRecord[];
  trips: TripRecord[];
};

/** Assemble the backup file from the rows that were read. */
export function buildBackupFile(
  input: BuildBackupFileInput,
): DiaryBackupFile {
  const summary = summarizeTrips(input.trips);
  return {
    version: DATA_FILE_VERSION,
    exportedAt: input.exportedAt,
    tripCount: summary.tripCount,
    totalFare: summary.totalFare,
    credentialsOmitted: input.accounts.length === 0,
    users: input.users,
    accounts: input.accounts,
    trips: input.trips,
  };
}

/**
 * Validate a parsed backup file before it is trusted.
 *
 * The file may have been edited by hand or produced by an older version of
 * this tool, so the shape is checked rather than assumed.
 */
export function parseBackupFile(raw: unknown): DiaryBackupFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("The backup file is not a valid object.");
  }

  const file = raw as Partial<DiaryBackupFile>;

  if (typeof file.version !== "number") {
    throw new Error("The backup file has no version number.");
  }
  if (file.version > DATA_FILE_VERSION) {
    throw new Error(
      `The backup file uses format version ${file.version}, but this tool understands up to ${DATA_FILE_VERSION}.`,
    );
  }
  if (!Array.isArray(file.trips)) {
    throw new Error("The backup file has no trips array.");
  }
  if (!Array.isArray(file.users)) {
    throw new Error("The backup file has no users array.");
  }
  if (!Array.isArray(file.accounts)) {
    throw new Error("The backup file has no accounts array.");
  }

  for (const trip of file.trips) {
    if (!trip || typeof trip.id !== "string" || typeof trip.tripDate !== "string") {
      throw new Error("The backup file contains a malformed trip.");
    }
  }

  return {
    version: file.version,
    exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : "",
    tripCount: typeof file.tripCount === "number" ? file.tripCount : file.trips.length,
    totalFare: typeof file.totalFare === "number" ? file.totalFare : 0,
    credentialsOmitted:
      typeof file.credentialsOmitted === "boolean"
        ? file.credentialsOmitted
        : file.accounts.length === 0,
    users: file.users,
    accounts: file.accounts,
    trips: file.trips,
  };
}
