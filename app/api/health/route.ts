import { NextResponse } from "next/server";
import mariadb from "mariadb";
import { db } from "../../../lib/db";

const clean = (value: string | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "");

// Removes the database host, user, password and name from an error text before it is shown.
function redact(text: string) {
  let out = text;
  for (const name of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    const value = clean(process.env[name]);
    if (value.length > 2) out = out.split(value).join(`<${name}>`);
  }
  return out.replace(/d{1,3}(.d{1,3}){3}/g, "<ip>").replace(/s+/g, " ").slice(0, 300);
}

// Connects once, directly (no pool), so the real reason a connection fails is visible.
async function directConnectionError() {
  const base = {
    host: clean(process.env.DB_HOST),
    port: Number(clean(process.env.DB_PORT) || 3306),
    user: clean(process.env.DB_USER),
    password: clean(process.env.DB_PASSWORD),
    database: clean(process.env.DB_NAME),
    connectTimeout: 8000,
  };
  const attempts: { label: string; ssl?: object }[] = [{ label: "plain" }, { label: "ssl", ssl: { rejectUnauthorized: false } }];
  const results: string[] = [];
  for (const attempt of attempts) {
    try {
      const connection = await mariadb.createConnection({ ...base, ...(attempt.ssl ? { ssl: attempt.ssl } : {}) });
      await connection.query("SELECT 1");
      await connection.end();
      results.push(`${attempt.label}: connected OK`);
    } catch (error) {
      const e = error as { code?: string; errno?: number; message?: string };
      results.push(`${attempt.label}: ${e.code ?? e.errno ?? "error"} - ${redact(String(e.message ?? ""))}`);
    }
  }
  return results;
}

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
// On failure it reports short, redacted diagnostics (never passwords or addresses) so a bad
// database setting can be found from the browser. The full error goes to the server log.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const tables = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()`;
    return NextResponse.json({ status: "ok", tables: Number(tables[0]?.n ?? 0) });
  } catch (error) {
    console.error("Health check: database error", error);
    const host = clean(process.env.DB_HOST);
    return NextResponse.json({
      status: "database unreachable",
      hostLooksLike: host.includes(":") ? "contains a colon (port in host?)" : /^d+(.d+){3}$/.test(host) ? "IP address" : host.includes(".") ? "domain name" : host ? "single word" : "EMPTY",
      port: clean(process.env.DB_PORT) || "EMPTY",
      direct: await directConnectionError(),
    }, { status: 503 });
  }
}
