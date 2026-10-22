import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { isoToPgTimestamp, isoToPgTimestampOrNull } from "./format";
import type { AccountRecord, TripRecord, UserRecord } from "./types";

/**
 * The standby database.
 *
 * This is a second PostgreSQL instance (Supabase, in practice) that mirrors
 * the primary. It exists so the diary survives losing the primary: the schema
 * comes from the committed Prisma migrations and the data comes from the
 * mirror, so promoting the standby is a `DATABASE_URL` change and nothing
 * else.
 *
 * The mirror is strictly one-way and strictly additive: rows are inserted or
 * updated, never deleted. A backup must never be able to destroy data.
 */

/** Rows per statement. Keeps the bind-parameter count comfortably low. */
const CHUNK_SIZE = 200;

/** True when a standby database is configured. */
export function isSecondaryConfigured(): boolean {
  return Boolean(process.env.SECONDARY_DATABASE_URL?.trim());
}

/**
 * Identify a database by host and name, ignoring the query string.
 *
 * `?sslmode=require` and `?pooling=true` style differences must not be
 * mistaken for two different databases.
 */
function databaseIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Refuse to mirror a test database into a real backup target.
 *
 * The automated test suite runs against a throwaway database, but a stray
 * environment variable can point the backup at it. Copying that would replace
 * the owner's real diary in the standby and the Google Sheet with test data,
 * and because the backup is incremental the damage is not obvious straight
 * away. Refusing loudly is the only safe answer.
 */
export function assertPrimaryIsNotATestDatabase(): void {
  const primary = process.env.DATABASE_URL?.trim();
  if (!primary) return;

  let name = "";
  try {
    const parsed = new URL(primary);
    name = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
  } catch {
    name = "";
  }

  if (/(^|_)tests?$/i.test(name)) {
    throw new Error(
      `DATABASE_URL points at what looks like a test database ("${name}"). ` +
        "Refusing to mirror test data into the backup targets.",
    );
  }
}

/**
 * Refuse to mirror a database onto itself.
 *
 * Without this guard a copy/paste mistake in the environment file could turn
 * the "backup" into a no-op that reports success while writing nowhere.
 */
export function assertSecondaryIsDistinct(): void {
  const primary = process.env.DATABASE_URL?.trim();
  const secondary = process.env.SECONDARY_DATABASE_URL?.trim();
  if (!primary || !secondary) return;

  if (databaseIdentity(primary) === databaseIdentity(secondary)) {
    throw new Error(
      "SECONDARY_DATABASE_URL points at the same database as DATABASE_URL. Refusing to mirror a database onto itself.",
    );
  }
}

const globalForSecondary = globalThis as unknown as {
  backupSecondaryPrisma?: PrismaClient;
};

/** Get the standby client, creating it on first use. */
export function getSecondaryClient(): PrismaClient {
  const url = process.env.SECONDARY_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("SECONDARY_DATABASE_URL is not set.");
  }
  assertSecondaryIsDistinct();

  if (!globalForSecondary.backupSecondaryPrisma) {
    globalForSecondary.backupSecondaryPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
  }
  return globalForSecondary.backupSecondaryPrisma;
}

/** Close the standby client. Used by the CLI scripts on shutdown. */
export async function disconnectSecondary(): Promise<void> {
  const client = globalForSecondary.backupSecondaryPrisma;
  if (!client) return;
  globalForSecondary.backupSecondaryPrisma = undefined;
  await client.$disconnect();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Turn a Prisma error into a message that is safe to store in the log.
 *
 * Customer data, credentials and connection strings never appear here.
 */
/**
 * Turn an error into a message that is safe to store and to publish.
 *
 * The result ends up in the `Meta` tab of the Google Sheet, so it must never
 * carry a connection string, a host name, a stack trace or customer data.
 * The full error is written to the server log instead, where it stays
 * private.
 */
export function describeMirrorError(error: unknown): string {
  if (error instanceof Error && error.message.includes("SECONDARY_DATABASE_URL")) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === "P2002") {
      return "The standby already has a row with the same unique value but a different id. Remove that row from the standby and run the backup again.";
    }
  }

  if (
    error instanceof Error &&
    /column .* does not exist/i.test(error.message)
  ) {
    return "The standby database is missing a column the app needs. Run npm run db:migrate:deploy:secondary and then the backup again.";
  }

  if (error instanceof Error) {
    return "The standby database could not be written. See the server log for details.";
  }

  return "Unknown error.";
}

async function upsertUsers(
  secondary: PrismaClient,
  users: UserRecord[],
): Promise<number> {
  for (const rows of chunk(users, CHUNK_SIZE)) {
    const values = Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.id}::text,
        ${row.name}::text,
        ${row.email}::text,
        ${row.emailVerified}::boolean,
        ${row.image}::text,
        ${isoToPgTimestamp(row.createdAt)}::timestamp,
        ${isoToPgTimestamp(row.updatedAt)}::timestamp
      )`),
    );

    await secondary.$executeRaw(Prisma.sql`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "email" = EXCLUDED."email",
        "emailVerified" = EXCLUDED."emailVerified",
        "image" = EXCLUDED."image",
        "createdAt" = EXCLUDED."createdAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
  return users.length;
}

async function upsertAccounts(
  secondary: PrismaClient,
  accounts: AccountRecord[],
): Promise<number> {
  for (const rows of chunk(accounts, CHUNK_SIZE)) {
    const values = Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.id}::text,
        ${row.accountId}::text,
        ${row.providerId}::text,
        ${row.userId}::text,
        ${row.accessToken}::text,
        ${row.refreshToken}::text,
        ${row.idToken}::text,
        ${isoToPgTimestampOrNull(row.accessTokenExpiresAt)}::timestamp,
        ${isoToPgTimestampOrNull(row.refreshTokenExpiresAt)}::timestamp,
        ${row.scope}::text,
        ${row.password}::text,
        ${isoToPgTimestamp(row.createdAt)}::timestamp,
        ${isoToPgTimestamp(row.updatedAt)}::timestamp
      )`),
    );

    await secondary.$executeRaw(Prisma.sql`
      INSERT INTO "account" (
        "id", "accountId", "providerId", "userId",
        "accessToken", "refreshToken", "idToken",
        "accessTokenExpiresAt", "refreshTokenExpiresAt",
        "scope", "password", "createdAt", "updatedAt"
      )
      VALUES ${values}
      ON CONFLICT ("id") DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "providerId" = EXCLUDED."providerId",
        "userId" = EXCLUDED."userId",
        "accessToken" = EXCLUDED."accessToken",
        "refreshToken" = EXCLUDED."refreshToken",
        "idToken" = EXCLUDED."idToken",
        "accessTokenExpiresAt" = EXCLUDED."accessTokenExpiresAt",
        "refreshTokenExpiresAt" = EXCLUDED."refreshTokenExpiresAt",
        "scope" = EXCLUDED."scope",
        "password" = EXCLUDED."password",
        "createdAt" = EXCLUDED."createdAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
  return accounts.length;
}

async function upsertTrips(
  secondary: PrismaClient,
  trips: TripRecord[],
): Promise<number> {
  for (const rows of chunk(trips, CHUNK_SIZE)) {
    const values = Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.id}::text,
        ${row.userId}::text,
        ${row.tripDate}::date,
        ${row.fromLocation}::text,
        ${row.toLocation}::text,
        ${row.fare}::integer,
        ${row.customerName}::text,
        ${row.customerPhone}::text,
        ${isoToPgTimestamp(row.createdAt)}::timestamp,
        ${isoToPgTimestamp(row.updatedAt)}::timestamp,
        ${row.kharch ?? "0"}::integer
      )`),
    );

    await secondary.$executeRaw(Prisma.sql`
      INSERT INTO "trip" (
        "id", "userId", "tripDate", "fromLocation", "toLocation",
        "fare", "customerName", "customerPhone", "createdAt", "updatedAt",
        "kharch"
      )
      VALUES ${values}
      ON CONFLICT ("id") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "tripDate" = EXCLUDED."tripDate",
        "fromLocation" = EXCLUDED."fromLocation",
        "toLocation" = EXCLUDED."toLocation",
        "fare" = EXCLUDED."fare",
        "customerName" = EXCLUDED."customerName",
        "customerPhone" = EXCLUDED."customerPhone",
        "createdAt" = EXCLUDED."createdAt",
        "updatedAt" = EXCLUDED."updatedAt",
        "kharch" = EXCLUDED."kharch"
    `);
  }
  return trips.length;
}

export type MirrorResult = {
  users: number;
  accounts: number;
  trips: number;
};

/**
 * Copy the owner, the credential rows and the trips into a database.
 *
 * The order matters: `trip.userId` is a foreign key into `user`, and
 * `account.userId` is too, so the user rows have to land first.
 *
 * This is used both for the standby mirror and for restoring a file export,
 * so it is written against "a database" rather than "the standby".
 */
export async function mirrorInto(
  target: PrismaClient,
  data: { users: UserRecord[]; accounts: AccountRecord[]; trips: TripRecord[] },
): Promise<MirrorResult> {
  const users = await upsertUsers(target, data.users);
  const accounts = await upsertAccounts(target, data.accounts);
  const trips = await upsertTrips(target, data.trips);

  return { users, accounts, trips };
}
