import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Hosting panels sometimes save a secret with a trailing space, a line break or surrounding quotes.
const setting = (name: string, fallback: string) => (process.env[name] ?? fallback).trim().replace(/^["']|["']$/g, "");

const adapter = new PrismaMariaDb({
  host: setting("DB_HOST", "localhost"),
  port: Number(setting("DB_PORT", "3306")),
  user: setting("DB_USER", "root"),
  password: setting("DB_PASSWORD", ""),
  database: setting("DB_NAME", "clinicdb"),
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
