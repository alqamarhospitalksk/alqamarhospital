import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import "dotenv/config";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running db:seed.`);
  return value;
}

const managementPassword = requiredEnvironment("SEED_MANAGEMENT_PASSWORD");
const operatorPassword = requiredEnvironment("SEED_OPERATOR_PASSWORD");

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "clinicdb",
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.upsert({ where: { username: "management" }, update: { active: true, passwordHash: hashPassword(managementPassword) }, create: { username: "management", passwordHash: hashPassword(managementPassword), role: "MANAGEMENT" } });
  await prisma.user.upsert({ where: { username: "operator" }, update: { active: true, passwordHash: hashPassword(operatorPassword) }, create: { username: "operator", passwordHash: hashPassword(operatorPassword), role: "OPERATOR" } });

  const catalogs = [
    ["LABORATORY", "Complete blood count"], ["LABORATORY", "Liver function test"], ["ECO", "Echocardiography"], ["X-RAY", "Chest X-Ray"], ["ECG", "12-lead ECG"], ["ULTRASOUND", "Abdominal ultrasound"],
  ];
  for (const [module, name] of catalogs) await prisma.diagnosticCatalogItem.upsert({ where: { module_name: { module, name } }, update: {}, create: { module, name, price: 0 } });
  for (const bed of [{ name: "Room 101 / Bed A", roomType: "General bed" }, { name: "Room 102 / Bed A", roomType: "Special room" }]) await prisma.roomBed.upsert({ where: { name: bed.name }, update: {}, create: { ...bed, dailyRate: 0 } });
}

main().finally(async () => { await prisma.$disconnect(); });
