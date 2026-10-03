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
  // Hosted MySQL (GoDaddy and most others) refuses an unencrypted login, so production connects
  // over SSL by default. Set DB_SSL=off to turn it off (e.g. a database on the same machine),
  // or DB_SSL=strict to also verify the server's certificate. Local development stays unencrypted.
  ...(process.env.DB_SSL === "strict"
    ? { ssl: true }
    : process.env.DB_SSL === "off" || (process.env.NODE_ENV !== "production" && process.env.DB_SSL !== "true")
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
