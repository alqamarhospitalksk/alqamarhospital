import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";

export async function GET() {
  return NextResponse.json({ authenticated: await isDevAuthenticated() });
}
