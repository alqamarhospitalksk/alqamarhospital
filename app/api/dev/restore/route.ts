import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";
import { runBackup, runRestore } from "../../../../lib/dev-db-tools";

export async function POST(request: Request) {
  if (!(await isDevAuthenticated())) return NextResponse.json({ error: "Developer authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";
  if (!filename) return NextResponse.json({ error: "Select a backup to restore." }, { status: 400 });
  if (confirm !== "RESTORE") return NextResponse.json({ error: 'Type "RESTORE" to confirm this action.' }, { status: 400 });

  try {
    // Safety net: capture what's about to be overwritten before touching anything.
    const safety = await runBackup("pre-restore");
    await runRestore(filename);
    return NextResponse.json({ ok: true, safetyBackupFilename: safety.filename });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Restore failed." }, { status: 500 });
  }
}
