import { prisma } from "../prisma";
import type { AccountRecord, TripRecord, UserRecord } from "./types";

/**
 * Reads the copy of the diary that is going to be backed up.
 *
 * Every timestamp is read with `to_char(...)` so the value comes back as the
 * exact wall-clock string stored in Postgres. That keeps the read independent
 * of the server's timezone and makes the mirror byte-identical to the source.
 */

export type PrimarySnapshot = {
  trips: TripRecord[];
  users: UserRecord[];
  accounts: AccountRecord[];
  /** Total number of trips in the primary database. */
  tripCount: number;
  /**
   * The newest `updatedAt` value across all trips, in canonical ISO form, or
   * `null` when there are no trips.
   *
   * The canonical form is fixed width, so a plain string comparison is also a
   * chronological comparison.
   */
  maxUpdatedAt: string | null;
};

/** Read the trips that make up the diary. */
export async function readTrips(): Promise<TripRecord[]> {
  return prisma.$queryRaw<TripRecord[]>`
    SELECT
      "id",
      "userId",
      to_char("tripDate", 'YYYY-MM-DD')                       AS "tripDate",
      "fromLocation",
      "toLocation",
      "fare"::text                                           AS "fare",
      "customerName",
      "customerPhone",
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "createdAt",
      to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "updatedAt"
    FROM "trip"
    ORDER BY "tripDate" ASC, "createdAt" ASC, "id" ASC
  `;
}

/** Read the owner account rows so the standby keeps the same login. */
export async function readUsers(): Promise<UserRecord[]> {
  return prisma.$queryRaw<UserRecord[]>`
    SELECT
      "id",
      "name",
      "email",
      "emailVerified",
      "image",
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "createdAt",
      to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "updatedAt"
    FROM "user"
    ORDER BY "id" ASC
  `;
}

/** Read the credential-provider rows (they hold the Argon2id hash). */
export async function readAccounts(): Promise<AccountRecord[]> {
  return prisma.$queryRaw<AccountRecord[]>`
    SELECT
      "id",
      "accountId",
      "providerId",
      "userId",
      "accessToken",
      "refreshToken",
      "idToken",
      to_char("accessTokenExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "accessTokenExpiresAt",
      to_char("refreshTokenExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "refreshTokenExpiresAt",
      "scope",
      "password",
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "createdAt",
      to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS "updatedAt"
    FROM "account"
    ORDER BY "id" ASC
  `;
}

/**
 * Read everything that gets backed up.
 *
 * `users` and `accounts` are only read when they are needed, because the
 * Sheet copy does not contain them.
 */
export async function readPrimarySnapshot(options: {
  includeCredentials: boolean;
}): Promise<PrimarySnapshot> {
  const trips = await readTrips();

  let users: UserRecord[] = [];
  let accounts: AccountRecord[] = [];
  if (options.includeCredentials) {
    [users, accounts] = await Promise.all([readUsers(), readAccounts()]);
  }

  let maxUpdatedAt: string | null = null;
  for (const trip of trips) {
    if (maxUpdatedAt === null || trip.updatedAt > maxUpdatedAt) {
      maxUpdatedAt = trip.updatedAt;
    }
  }

  return {
    trips,
    users,
    accounts,
    tripCount: trips.length,
    maxUpdatedAt,
  };
}
