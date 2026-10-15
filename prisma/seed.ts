import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import "dotenv/config";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// One starter login per role. Each password comes from .env (never from this file). A user is only
// created when the username does not exist yet, so an existing account's password is never reset.
// Like any new account, each one must choose its own password at first sign-in.
const starterUsers = [
  { name: "Management", username: "management", role: "MANAGEMENT", passwordEnv: "SEED_MANAGEMENT_PASSWORD" },
  { name: "Operator", username: "operator", role: "OPERATOR", passwordEnv: "SEED_OPERATOR_PASSWORD" },
  { name: "Medical Store", username: "store", role: "MEDICAL_STORE", passwordEnv: "SEED_STORE_PASSWORD" },
  { name: "Lab", username: "lab", role: "LAB", passwordEnv: "SEED_LAB_PASSWORD" },
] as const;

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
  for (const { name, username, role, passwordEnv } of starterUsers) {
    if (await prisma.user.findUnique({ where: { username } })) continue;
    const password = process.env[passwordEnv];
    if (!password) {
      console.log(`Skipped user "${username}": set ${passwordEnv} in .env to create it.`);
      continue;
    }
    await prisma.user.create({ data: { name, username, passwordHash: hashPassword(password), role, mustChangePassword: true } });
    console.log(`Created user "${username}" (${role})`);
  }

  const catalogs = [
    ["LABORATORY", "Complete blood count"], ["LABORATORY", "Liver function test"], ["ECO", "Echocardiography"], ["X-RAY", "Chest X-Ray"], ["ECG", "12-lead ECG"], ["ULTRASOUND", "Abdominal ultrasound"],
  ];
  for (const [module, name] of catalogs) await prisma.diagnosticCatalogItem.upsert({ where: { module_name: { module, name } }, update: {}, create: { module, name, price: 0 } });
  for (const bed of [{ name: "Room 101 / Bed A", roomType: "General bed" }, { name: "Room 102 / Bed A", roomType: "Special room" }]) await prisma.roomBed.upsert({ where: { name: bed.name }, update: {}, create: { ...bed, dailyRate: 0 } });
}

main().finally(async () => { await prisma.$disconnect(); });
