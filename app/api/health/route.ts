import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
// The failure response is deliberately plain; the real error goes to the server log.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Health check: database error", error);
    return NextResponse.json({ status: "database unreachable" }, { status: 503 });
  }
}
