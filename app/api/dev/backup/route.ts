import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";
import { runBackup } from "../../../../lib/dev-db-tools";

export async function POST() {
  if (!(await isDevAuthenticated())) return NextResponse.json({ error: "Developer authentication required." }, { status: 401 });
  try {
    const { filename } = await runBackup("backup");
    return NextResponse.json({ ok: true, filename });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backup failed." }, { status: 500 });
  }
}
