import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Applies the Prisma migrations to the test database before the suite runs.
 * The test database is separate from the development/production database and
 * is controlled exclusively by this file.
 */
export default function globalSetup() {
  const rootDir = process.cwd();
  const prismaCli = path.join(
    rootDir,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Create a .env.test file (see .env.example).",
    );
  }

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: rootDir,
    env: { ...process.env },
    stdio: "inherit",
  });
}
