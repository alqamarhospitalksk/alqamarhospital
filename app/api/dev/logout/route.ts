import { NextResponse } from "next/server";
import { clearDevSession } from "../../../../lib/dev-auth";

export async function POST() {
  await clearDevSession();
  return NextResponse.json({ ok: true });
}
