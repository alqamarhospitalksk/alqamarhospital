import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";
import { listBackups } from "../../../../lib/dev-db-tools";

export async function GET() {
  if (!(await isDevAuthenticated())) return NextResponse.json({ error: "Developer authentication required." }, { status: 401 });
  return NextResponse.json({ backups: listBackups() });
}
