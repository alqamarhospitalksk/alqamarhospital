import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const cases = await db.otCase.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { patient: true, doctor: true, roomBed: true, payments: { where: { status: "PAID" }, orderBy: { createdAt: "desc" } } },
  });

  return NextResponse.json({
    cases: cases
      .filter((c) => c.patient != null && c.doctor != null)
      .map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        status: c.status,
        admissionDate: c.admissionDate,
        patient: { name: c.patient.name, mrNumber: c.patient.mrNumber },
        doctor: { name: c.doctor.name },
        roomBed: { name: c.roomLabel ?? c.roomBed?.name ?? "—" },
        total: c.total.toString(),
        paymentMethod: c.payments[0]?.method ?? null,
        // Paid so far vs. the bill: items added after admission can leave a balance.
        paid: c.payments.reduce((sum, p) => sum + Number(p.amount), 0),
        balance: Math.max(0, Math.round((Number(c.total) - c.payments.reduce((sum, p) => sum + Number(p.amount), 0)) * 100) / 100),
      })),
  });
}
