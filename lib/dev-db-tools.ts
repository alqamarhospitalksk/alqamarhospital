import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, statSync, appendFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "./db";

const execFileAsync = promisify(execFile);

const BACKUPS_DIR = path.join(process.cwd(), "backups");

// The dev machine's MariaDB client tools aren't necessarily on PATH (this project connects
// via Prisma's own driver, not a CLI) — these are the known install locations on this
// machine's WAMP stack. MYSQLDUMP_PATH/MYSQL_PATH env vars override for any other machine.
const CANDIDATE_DIRS = [
  "C:/wamp64/bin/mariadb/mariadb11.3.2/bin",
  "C:/Program Files/MariaDB 11.4/bin",
  "C:/Program Files/MariaDB 10.11/bin",
  "C:/xampp/mysql/bin",
];

function resolveBinary(envVar: string, exeNames: string[]): string {
  const override = process.env[envVar];
  if (override && existsSync(override)) return override;
  for (const dir of CANDIDATE_DIRS) {
    for (const exe of exeNames) {
      const full = path.join(dir, exe);
      if (existsSync(full)) return full;
    }
  }
  return exeNames[0];
}

const mysqldumpPath = () => resolveBinary("MYSQLDUMP_PATH", ["mysqldump.exe", "mariadb-dump.exe"]);
const mysqlClientPath = () => resolveBinary("MYSQL_PATH", ["mysql.exe", "mariadb.exe"]);

function dbConfig() {
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: process.env.DB_PORT ?? "3306",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "clinicdb",
  };
}

function ensureBackupsDir() {
  if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });
  return BACKUPS_DIR;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Self-contained log, deliberately outside the app database — a Clean run wipes every DB
// table, so an audit trail stored there would erase itself the moment it recorded the action.
export function logDevAction(message: string) {
  const dir = ensureBackupsDir();
  appendFileSync(path.join(dir, "dev-actions.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
}

export async function runBackup(labelPrefix = "backup"): Promise<{ filename: string; filePath: string }> {
  const dir = ensureBackupsDir();
  const { host, port, user, password, database } = dbConfig();
  const filename = `${labelPrefix}-${database}-${timestamp()}.sql`;
  const filePath = path.join(dir, filename);
  const args = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    ...(password ? [`--password=${password}`] : []),
    "--single-transaction",
    "--routines",
    "--triggers",
    `--result-file=${filePath}`,
    database,
  ];
  try {
    await execFileAsync(mysqldumpPath(), args, { windowsHide: true });
  } catch (error) {
    throw new Error(`mysqldump failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  logDevAction(`BACKUP created: ${filename}`);
  return { filename, filePath };
}

export function listBackups() {
  const dir = ensureBackupsDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const stat = statSync(path.join(dir, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function runRestore(filename: string): Promise<void> {
  const safeName = path.basename(filename);
  if (safeName !== filename || !safeName.endsWith(".sql")) throw new Error("Invalid backup filename.");
  const dir = ensureBackupsDir();
  const filePath = path.join(dir, safeName);
  if (!existsSync(filePath)) throw new Error("Backup file not found.");

  const { host, port, user, password, database } = dbConfig();
  const args = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    ...(password ? [`--password=${password}`] : []),
    database,
  ];

  await new Promise<void>((resolve, reject) => {
    const inputFd = openSync(filePath, "r");
    const child = spawn(mysqlClientPath(), args, { stdio: [inputFd, "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      closeSync(inputFd);
      reject(err);
    });
    child.on("close", (code) => {
      closeSync(inputFd);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `mysql exited with code ${code}`));
    });
  });

  logDevAction(`RESTORE applied: ${safeName}`);
}

export async function runClean(): Promise<{ backupFilename: string; tablesCleared: string[] }> {
  const backup = await runBackup("pre-clean");

  const tables = await db.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  // _prisma_migrations tracks which migrations have been applied to the schema itself —
  // wiping it would desync Prisma's migration state even though the schema is untouched
  // (TRUNCATE only clears rows, not table structure).
  const tableNames = tables.map((t) => t.TABLE_NAME).filter((name) => name !== "_prisma_migrations");

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
    for (const name of tableNames) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
    }
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  });

  logDevAction(`CLEAN executed — ${tableNames.length} tables truncated (safety backup: ${backup.filename})`);
  return { backupFilename: backup.filename, tablesCleared: tableNames };
}
