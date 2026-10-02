import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { buildMedicalStoreReport, parseReportRange } from "../../../../lib/medical-store-report";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const range = parseReportRange(new URL(request.url));
  if (!range) return NextResponse.json({ error: "Enter a valid date range." }, { status: 400 });

  return NextResponse.json(await buildMedicalStoreReport(range.fromDate, range.toDate));
}
