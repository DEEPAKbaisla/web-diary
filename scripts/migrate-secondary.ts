import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Applies the Prisma migrations to the standby database.
 *
 * The schema lives in git (`prisma/migrations`), so the standby is brought up
 * to date with exactly the same migrations the primary runs. Only the data
 * has to be copied separately.
 *
 *   npm run db:migrate:deploy:secondary
 *
 * The Prisma CLI is spawned with `DATABASE_URL` pointed at the standby. It is
 * started through `process.execPath` rather than `npx` so the command behaves
 * identically on Windows, macOS and Linux.
 */

const prismaCli = path.join(
  process.cwd(),
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

function main(): void {
  const secondary = process.env.SECONDARY_DATABASE_URL?.trim();
  if (!secondary) {
    console.error("SECONDARY_DATABASE_URL is not set.");
    process.exit(1);
  }

  const primary = process.env.DATABASE_URL?.trim();
  if (primary && primary === secondary) {
    console.error(
      "SECONDARY_DATABASE_URL is the same as DATABASE_URL. Refusing to migrate the primary from the standby script.",
    );
    process.exit(1);
  }

  if (!existsSync(prismaCli)) {
    console.error(
      `Could not find the Prisma CLI at ${prismaCli}. Run npm install first.`,
    );
    process.exit(1);
  }

  console.log("Applying migrations to the standby database...");

  const child = spawn(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      // The child inherits everything else and only swaps the database.
      env: { ...process.env, DATABASE_URL: secondary },
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error("Could not start the Prisma CLI:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`The Prisma CLI was stopped by ${signal}.`);
      process.exit(1);
    }
    if (code !== 0) {
      console.error("The standby migration failed.");
      process.exit(1);
    }
    console.log("The standby database is up to date.");
  });
}

main();
