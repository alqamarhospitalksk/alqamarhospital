import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

// Which recent features this code has. Add a word here when you ship something you may need to confirm on the host.
const FEATURES = ["opd-serial", "patient-city", "slip-token-no", "start-db-updates"];

// Used by uptime monitors / the hosting panel: 200 when the app and its database are reachable.
// "build" is when this code was built and "started" when this server process started: together they show
// whether a deployment really runs new code. The failure response is deliberately plain; the real error
// goes to the server log.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      build: process.env.BUILD_TIME ?? "unknown",
      started: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      features: FEATURES,
    });
  } catch (error) {
    console.error("Health check: database error", error);
    return NextResponse.json({ status: "database unreachable" }, { status: 503 });
  }
}
