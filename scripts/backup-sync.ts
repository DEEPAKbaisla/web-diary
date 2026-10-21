import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { disconnectSecondary } from "../src/lib/backup/secondary";
import { runBackupSync } from "../src/lib/backup/sync";

/**
 * Runs the backup from the command line.
 *
 * This is the same code path the scheduled job uses, so a manual run and an
 * automated run produce identical results.
 *
 *   npm run backup:sync            # every configured target
 *   npm run backup:sync -- --force # copy even if nothing changed
 *   npm run backup:sync -- --sheet # only the Google Sheet
 *   npm run backup:sync -- --db    # only the standby database
 */

type CliOptions = {
  force: boolean;
  targets?: Array<"google_sheet" | "secondary_db">;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { force: false };

  if (argv.includes("--force")) {
    options.force = true;
  }

  const sheet = argv.includes("--sheet");
  const database = argv.includes("--db");
  if (sheet && database) {
    options.targets = ["google_sheet", "secondary_db"];
  } else if (sheet) {
    options.targets = ["google_sheet"];
  } else if (database) {
    options.targets = ["secondary_db"];
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runBackupSync({
    trigger: "manual",
    force: options.force,
    targets: options.targets,
  });

  if (result.notConfigured) {
    console.log(
      "No backup target is configured. Set SECONDARY_DATABASE_URL and/or GOOGLE_SHEET_SCRIPT_URL in .env.",
    );
    return;
  }

  console.log(
    `Backup finished in ${result.durationMs} ms — ${result.tripCount} trips.`,
  );

  for (const target of result.targets) {
    console.log(`  ${target.target}: ${target.status} — ${target.detail}`);
    if (target.spreadsheetId) {
      console.log(`      spreadsheet: ${target.spreadsheetId}`);
    }
  }

  if (!result.ok) {
    console.error("The backup did not complete successfully.");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Backup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSecondary();
    await prisma.$disconnect();
  });
