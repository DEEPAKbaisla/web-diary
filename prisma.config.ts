import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 config. `prisma generate` does not need a database, so we fall back
// to an empty string when DATABASE_URL is absent (e.g. CI type-checking).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
