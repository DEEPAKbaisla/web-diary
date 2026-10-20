import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Prepares the end-to-end test database:
 *  1. applies the Prisma migrations
 *  2. wipes previous test data and recreates the owner account
 *
 * Both steps run in child processes because the Prisma 7 client is ESM-only,
 * while the Playwright config is loaded as CommonJS.
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
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: rootDir,
    env: { ...process.env },
    stdio: "inherit",
  });

  const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(
    process.execPath,
    [tsxCli, path.join(rootDir, "scripts", "seed-test-owner.ts")],
    {
      cwd: rootDir,
      env: { ...process.env },
      stdio: "inherit",
    },
  );
}
