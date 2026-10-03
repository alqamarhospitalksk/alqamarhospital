import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

// Removes the database host, user and password from an error text before it is shown.
function redact(text: string) {
  let out = text;
  for (const name of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    const value = process.env[name];
    if (value && value.length > 2) out = out.split(value).join(`<${name}>`);
  }
  return out.replace(/d{1,3}(.d{1,3}){3}/g, "<ip>").slice(0, 300);
}

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
// On failure it reports a short error code and the database's own message with host, user and
// password blanked out, so a bad setting can be diagnosed from the browser. The full error goes
// to the server log.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const tables = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()`;
    return NextResponse.json({ status: "ok", tables: Number(tables[0]?.n ?? 0) });
  } catch (error) {
    console.error("Health check: database error", error);
    const e = error as { code?: string; message?: string; meta?: Record<string, unknown>; cause?: { code?: string; message?: string } } | null;
    const meta = e?.meta ?? {};
    const code = e?.cause?.code ?? (typeof meta.code === "string" ? meta.code : undefined) ?? e?.code ?? "UNKNOWN";
    const detail = redact(String(meta.message ?? e?.cause?.message ?? e?.message ?? "").replace(/s+/g, " "));
    const configured = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"].map((name) => `${name}=${process.env[name] ? "set" : "MISSING"}`);
    return NextResponse.json({ status: "database unreachable", code, detail, settings: configured }, { status: 503 });
  }
}
