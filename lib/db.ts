import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "clinicdb",
  connectionLimit: 5,
  connectTimeout: 10000,
  // Some hosted databases only accept encrypted connections. Set DB_SSL=true to turn that on
  // (DB_SSL=strict also verifies the server certificate).
  ...(process.env.DB_SSL === "true" ? { ssl: { rejectUnauthorized: false } } : {}),
  ...(process.env.DB_SSL === "strict" ? { ssl: true } : {}),
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
