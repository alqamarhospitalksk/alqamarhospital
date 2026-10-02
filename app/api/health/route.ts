import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "database unreachable" }, { status: 503 });
  }
}
