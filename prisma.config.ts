import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // "prisma generate" (run by the build) only needs a URL to exist, not a reachable database.
    url: process.env.DATABASE_URL ?? "mysql://user:password@localhost:3306/database",
  },
});