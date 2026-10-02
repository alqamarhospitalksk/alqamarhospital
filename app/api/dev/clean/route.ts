import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";
import { runClean } from "../../../../lib/dev-db-tools";

const CONFIRM_PHRASE = "DELETE ALL DATA";

export async function POST(request: Request) {
  if (!(await isDevAuthenticated())) return NextResponse.json({ error: "Developer authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Type "${CONFIRM_PHRASE}" to confirm this action.` }, { status: 400 });
  }

  try {
    const result = await runClean();
    return NextResponse.json({ ok: true, safetyBackupFilename: result.backupFilename, tablesCleared: result.tablesCleared.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Clean failed." }, { status: 500 });
  }
}
