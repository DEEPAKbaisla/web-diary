import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Applies the Prisma migrations to the test database before the suite runs.
 * The test database is separate from the development/production database and
 * is controlled exclusively by this file.
 */
export default async function globalSetup() {
  const rootDir = process.cwd();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Create a .env.test file (see .env.example).",
    );
  }

  // Probe the database first so an unreachable test database produces a clear
  // message here instead of a confusing failure inside every database test.
  const { prisma } = await import("../src/lib/prisma");
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn(
      "[vitest] Test database is unreachable - skipping migrations. " +
        "Tests that need a database will fail until it is reachable.",
    );
    await prisma.$disconnect();
    return;
  }
  await prisma.$disconnect();

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
}
