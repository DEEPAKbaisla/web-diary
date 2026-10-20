import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Tests always run against the dedicated test database defined in .env.test.
loadEnv({ path: path.join(rootDir, ".env.test"), override: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // The API tests share one PostgreSQL database, so they must not run in
    // parallel with each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
