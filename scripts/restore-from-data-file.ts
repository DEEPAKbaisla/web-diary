import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { disconnectSecondary, mirrorInto } from "../src/lib/backup/secondary";
import { parseBackupFile } from "../src/lib/backup/data-file";

/**
 * Restores a portable backup file into the database `DATABASE_URL` points at.
 *
 *   npm run restore:file -- --file backups\diary-2026-10-21T14-30-00.json
 *   npm run restore:file -- --file <path> --dry-run
 *
 * The restore is an upsert: rows are inserted or updated by their id and
 * nothing is ever deleted. Running it twice is harmless, and it can be run
 * against a database that already holds the diary.
 *
 * Restore order for a brand new database:
 *
 *   1. point DATABASE_URL at the new database
 *   2. npm run db:migrate:deploy      (the schema comes from git)
 *   3. npm run restore:file -- --file <path>
 *   4. npm run db:owner                (only if the file has no credentials)
 */

function parseArgs(argv: string[]): { file?: string; dryRun: boolean } {
  const options: { file?: string; dryRun: boolean } = { dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file" || arg === "-f") {
      options.file = argv[index + 1];
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.file) {
    console.error("Usage: npm run restore:file -- --file <path>");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), options.file);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${filePath}:`, error);
    process.exit(1);
  }

  const file = parseBackupFile(parsed);

  const existing = await prisma.trip.count();

  console.log(`Restoring from ${filePath}`);
  console.log(`  exported at   ${file.exportedAt || "unknown"}`);
  console.log(`  trips         ${file.tripCount}`);
  console.log(`  total fare    ${file.totalFare}`);
  console.log(`  credentials   ${file.credentialsOmitted ? "not included" : "included"}`);
  console.log(`  current trips ${existing} in the target database`);

  if (options.dryRun) {
    console.log("Dry run — nothing was written.");
    return;
  }

  const result = await mirrorInto(prisma, {
    users: file.users,
    accounts: file.accounts,
    trips: file.trips,
  });

  console.log(
    `Restored ${result.trips} trips, ${result.users} users and ${result.accounts} credential rows.`,
  );
  if (file.credentialsOmitted) {
    console.log(
      "This file had no credential rows, so create the owner account with: npm run db:owner",
    );
  }
}

main()
  .catch((error) => {
    console.error("The restore failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSecondary();
    await prisma.$disconnect();
  });
