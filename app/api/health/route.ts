import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
// On failure it reports only a short error code (never passwords or addresses) so a bad
// database setting can be diagnosed from the browser; the full error goes to the server log.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const tables = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()`;
    return NextResponse.json({ status: "ok", tables: Number(tables[0]?.n ?? 0) });
  } catch (error) {
    console.error("Health check: database error", error);
    const e = error as { code?: string; errno?: number; cause?: { code?: string } } | null;
    const code = e?.cause?.code ?? e?.code ?? (e?.errno ? String(e.errno) : "UNKNOWN");
    const configured = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"].map((name) => `${name}=${process.env[name] ? "set" : "MISSING"}`);
    return NextResponse.json({ status: "database unreachable", code, settings: configured }, { status: 503 });
  }
}
