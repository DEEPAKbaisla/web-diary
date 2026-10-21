import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { disconnectSecondary } from "../src/lib/backup/secondary";
import { buildBackupFile } from "../src/lib/backup/data-file";
import { tripsToCsv } from "../src/lib/backup/sheet-payload";
import { readPrimarySnapshot } from "../src/lib/backup/source";

/**
 * Writes a portable copy of the diary to a file.
 *
 * The JSON file is the provider-agnostic safety net. It can be uploaded to
 * Google Drive, a private repository or a USB stick and restored into any
 * PostgreSQL database — including a brand new one that has never heard of
 * this project.
 *
 *   npm run backup:file
 *   npm run backup:file -- --no-credentials
 *
 * The files are written to `backups/`, which is git-ignored. They contain the
 * owner's Argon2id password hash, so treat them as sensitive.
 */

const BACKUP_DIR = path.join(process.cwd(), "backups");

function parseArgs(argv: string[]): { includeCredentials: boolean } {
  return { includeCredentials: !argv.includes("--no-credentials") };
}

/** A filesystem-safe timestamp such as `2026-10-21T14-30-00`. */
function fileStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const snapshot = await readPrimarySnapshot({
    includeCredentials: options.includeCredentials,
  });

  const now = new Date();
  const file = buildBackupFile({
    exportedAt: now.toISOString(),
    users: snapshot.users,
    accounts: snapshot.accounts,
    trips: snapshot.trips,
  });

  await mkdir(BACKUP_DIR, { recursive: true });

  const base = path.join(BACKUP_DIR, `diary-${fileStamp(now)}`);
  const jsonPath = `${base}.json`;
  const csvPath = `${base}.csv`;

  await writeFile(jsonPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await writeFile(csvPath, tripsToCsv(snapshot.trips), "utf8");

  console.log(`Exported ${file.tripCount} trips (total fare ${file.totalFare}).`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${csvPath}`);
  if (file.credentialsOmitted) {
    console.log(
      "  The credential rows were left out, so this file cannot restore the owner password.",
    );
  } else {
    console.log(
      "  This file contains the owner password hash. Store it somewhere safe.",
    );
  }
}

main()
  .catch((error) => {
    console.error("The export failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSecondary();
    await prisma.$disconnect();
  });
