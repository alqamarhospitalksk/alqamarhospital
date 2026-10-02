import { NextResponse } from "next/server";
import { createDevSession, isDevConsoleEnabled, isDevPasswordConfigured, verifyDevPassword } from "../../../../lib/dev-auth";

export async function POST(request: Request) {
  if (!isDevConsoleEnabled()) return NextResponse.json({ error: "The developer console is turned off on this server." }, { status: 404 });
  if (!isDevPasswordConfigured()) {
    return NextResponse.json({ error: "DEV_ACCESS_PASSWORD is not configured on the server." }, { status: 500 });
  }
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!verifyDevPassword(password)) {
    return NextResponse.json({ error: "Incorrect developer password." }, { status: 401 });
  }
  await createDevSession();
  return NextResponse.json({ ok: true });
}
