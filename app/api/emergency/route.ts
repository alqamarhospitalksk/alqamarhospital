import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { runTransaction } from "../../../lib/transaction";
import { toDateColumnBoundary } from "../../../lib/date-range";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const visits = await db.emergencyVisit.findMany({
    orderBy: { id: "desc" },
    take: 40,
    include: { patient: true, payments: { orderBy: { id: "asc" }, take: 1 } },
  });

  return NextResponse.json({
    visits: visits
      .filter((v) => v.patient != null)
      .map((v) => ({
        id: v.id,
        visitNumber: v.visitNumber,
        dailyToken: v.dailyToken,
        visitDate: v.visitDate,
        reason: v.reason,
        amount: v.amount.toString(),
        paymentMethod: v.payments[0]?.method ?? "CASH",
        patient: {
          name: v.patient.name,
          mrNumber: v.patient.mrNumber,
          fatherName: v.patient.fatherName,
          gender: v.patient.gender,
          cnic: v.patient.cnic,
          dateOfBirth: v.patient.dateOfBirth,
        },
      })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const patientId = Number(body?.patientId);
  const reason = text(body?.reason);
  const amount = Number(body?.amount);
  const paymentMethod = text(body?.paymentMethod) || "CASH";

  if (!Number.isInteger(patientId) || !reason || !Number.isFinite(amount) || amount < 0 || !methods.includes(paymentMethod)) {
    return NextResponse.json({ error: "Select a patient, enter a reason, a valid amount, and a valid payment method." }, { status: 400 });
  }

  try {
    const visit = await runTransaction(async (transaction) => {
      const patient = await transaction.patient.findUnique({ where: { id: patientId } });
      if (!patient) throw new Error("Patient not found.");

      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      // `@db.Date` column — see lib/date-range.ts for why this is UTC-anchored.
      const visitDate = toDateColumnBoundary(new Date(`${dateKey}T00:00:00`));
      const sequenceKey = `EMERGENCY:${dateKey}`;

      const sequence = await transaction.dailySequence.upsert({
        where: { sequenceKey },
        create: { sequenceKey, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      let dailyToken = sequence.nextValue - 1;

      // Guard against a stale sequence the same way OPD does.
      const lastVisit = await transaction.emergencyVisit.findFirst({
        where: { visitDate },
        orderBy: { dailyToken: "desc" },
        select: { dailyToken: true },
      });
      if (lastVisit && lastVisit.dailyToken >= dailyToken) {
        dailyToken = lastVisit.dailyToken + 1;
        await transaction.dailySequence.update({ where: { sequenceKey }, data: { nextValue: dailyToken + 1 } });
      }

      const visitNumber = `EMG-${dateKey.replaceAll("-", "")}-${String(dailyToken).padStart(4, "0")}`;

      const createdVisit = await transaction.emergencyVisit.create({
        data: { visitNumber, visitDate, dailyToken, patientId, reason, amount, createdById: user.id },
      });
      await transaction.payment.create({
        data: { amount, method: paymentMethod as "CASH", emergencyVisitId: createdVisit.id, createdById: user.id },
      });
      return { ...createdVisit, patient };
    });

    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "EmergencyVisit",
        entityId: String(visit.id),
        userId: user.id,
        reason,
        afterJson: JSON.stringify({ visitNumber: visit.visitNumber, dailyToken: visit.dailyToken, patientId, amount }),
      },
    });

    return NextResponse.json(
      {
        visit: {
          visitNumber: visit.visitNumber,
          dailyToken: visit.dailyToken,
          reason: visit.reason,
          amount: visit.amount.toString(),
          paymentMethod,
          patient: {
            name: visit.patient.name,
            mrNumber: visit.patient.mrNumber,
            fatherName: visit.patient.fatherName,
            gender: visit.patient.gender,
            cnic: visit.patient.cnic,
            dateOfBirth: visit.patient.dateOfBirth,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the emergency visit." }, { status: 409 });
  }
}
