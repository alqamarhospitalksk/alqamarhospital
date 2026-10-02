import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { runTransaction } from "../../../lib/transaction";
import { toDateColumnBoundary } from "../../../lib/date-range";
import { parseAvailabilityDays } from "../../../lib/doctor-availability";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const visits = await db.opdVisit.findMany({
    orderBy: { id: "desc" },
    take: 40,
    include: {
      patient: true,
      doctor: true,
      payments: { orderBy: { id: "asc" }, take: 1 },
    },
  });

  return NextResponse.json({
    visits: visits.filter((v) => v.patient != null && v.doctor != null).map((v) => ({
      id: v.id,
      opdNumber: v.opdNumber,
      dailyToken: v.dailyToken,
      consultationFee: v.consultationFee.toString(),
      paymentMethod: v.payments[0]?.method ?? "CASH",
      freeReason: v.payments[0]?.method === "FREE" ? v.payments[0]?.note ?? null : null,
      visitDate: v.visitDate,
      patient: {
        id: v.patient.id,
        name: v.patient.name,
        mrNumber: v.patient.mrNumber,
        fatherName: v.patient.fatherName,
        gender: v.patient.gender,
        cnic: v.patient.cnic,
        dateOfBirth: v.patient.dateOfBirth,
        mobile: v.patient.mobile,
      },
      doctor: {
        id: v.doctor.id,
        name: v.doctor.name,
        specialization: v.doctor.specialization,
        nameUrdu: v.doctor.nameUrdu,
        specializationUrdu: v.doctor.specializationUrdu,
        qualifications: v.doctor.qualifications,
        qualificationsUrdu: v.doctor.qualificationsUrdu,
        availability: v.doctor.availability,
        availabilityDays: parseAvailabilityDays(v.doctor.availabilityDays),
        availabilityFrom: v.doctor.availabilityFrom,
        availabilityTo: v.doctor.availabilityTo,
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
  const doctorId = Number(body?.doctorId);
  const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "CASH";
  const freeReason = typeof body?.freeReason === "string" ? body.freeReason.trim() : "";

  if (!Number.isInteger(patientId) || !Number.isInteger(doctorId) || !["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "FREE"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Select a valid patient, doctor, and payment method." }, { status: 400 });
  }
  if (paymentMethod === "FREE" && !freeReason) {
    return NextResponse.json({ error: "Enter a reason for waiving the consultation fee." }, { status: 400 });
  }

  const currentDoctor = await db.doctor.findFirst({ where: { id: doctorId, active: true } });
  if (!currentDoctor) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });

  try {
    const visit = await runTransaction(async (transaction) => {
      const [patient, doctor] = await Promise.all([
        transaction.patient.findUnique({ where: { id: patientId } }),
        transaction.doctor.findFirst({ where: { id: doctorId, active: true } }),
      ]);
      if (!patient || !doctor) throw new Error("Patient or doctor not found.");

      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      // visitDate is a `@db.Date` column: local midnight would be stored as the previous day
      // (see lib/date-range.ts), so anchor it to UTC midnight of today's local date.
      const visitDate = toDateColumnBoundary(new Date(`${dateKey}T00:00:00`));
      const sequenceKey = `OPD:${doctorId}:${dateKey}`;

      const sequence = await transaction.dailySequence.upsert({
        where: { sequenceKey },
        create: { sequenceKey, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      let dailyToken = sequence.nextValue - 1;

      // Guard against stale sequence (e.g. from a previously rolled-back transaction):
      // find the highest existing token for this doctor today and use max+1 if needed.
      const lastVisit = await transaction.opdVisit.findFirst({
        where: { doctorId, visitDate },
        orderBy: { dailyToken: "desc" },
        select: { dailyToken: true },
      });
      if (lastVisit && lastVisit.dailyToken >= dailyToken) {
        dailyToken = lastVisit.dailyToken + 1;
        // Sync the sequence forward so future calls start from the right place
        await transaction.dailySequence.update({
          where: { sequenceKey },
          data: { nextValue: dailyToken + 1 },
        });
      }

      const opdNumber = `OPD-${dateKey.replaceAll("-", "")}-${String(doctorId).padStart(3, "0")}-${String(dailyToken).padStart(4, "0")}`;
      const chargedFee = paymentMethod === "FREE" ? 0 : doctor.consultationFee;

      const createdVisit = await transaction.opdVisit.create({ data: { opdNumber, visitDate, dailyToken, patientId, doctorId, consultationFee: chargedFee, createdById: user.id } });
      await transaction.payment.create({
        data: {
          amount: chargedFee,
          method: paymentMethod as "CASH",
          note: paymentMethod === "FREE" ? freeReason : undefined,
          opdVisitId: createdVisit.id,
          createdById: user.id,
        },
      });
      return { ...createdVisit, patient, doctor };
    });

    await db.auditLog.create({ data: { action: "CREATE", entity: "OpdVisit", entityId: String(visit.id), userId: user.id, reason: paymentMethod === "FREE" ? freeReason : null, afterJson: JSON.stringify({ opdNumber: visit.opdNumber, dailyToken: visit.dailyToken, patientId, doctorId, paymentMethod }) } });

    return NextResponse.json(
      {
      visit: {
        opdNumber: visit.opdNumber,
        dailyToken: visit.dailyToken,
        consultationFee: visit.consultationFee.toString(),
        paymentMethod,
        freeReason: paymentMethod === "FREE" ? freeReason : null,
        patient: {
          name: visit.patient.name,
          mrNumber: visit.patient.mrNumber,
          fatherName: visit.patient.fatherName,
          gender: visit.patient.gender,
          cnic: visit.patient.cnic,
          dateOfBirth: visit.patient.dateOfBirth,
        },
        doctor: {
          name: visit.doctor.name,
          specialization: visit.doctor.specialization,
          nameUrdu: visit.doctor.nameUrdu,
          specializationUrdu: visit.doctor.specializationUrdu,
          qualifications: visit.doctor.qualifications,
          qualificationsUrdu: visit.doctor.qualificationsUrdu,
          availability: visit.doctor.availability,
          availabilityDays: parseAvailabilityDays(visit.doctor.availabilityDays),
          availabilityFrom: visit.doctor.availabilityFrom,
          availabilityTo: visit.doctor.availabilityTo,
        },
      },
    },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unable to create OPD visit", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the OPD visit. Please try again." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!id || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Valid OPD visit ID is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const returnedMainSlip = Boolean(body?.returnedMainSlip);
  const returnedDoctorReceipt = Boolean(body?.returnedDoctorReceipt);
  const returnedPatientReceipt = Boolean(body?.returnedPatientReceipt);

  if (!reason) {
    return NextResponse.json({ error: "A reason is required to delete an OPD visit." }, { status: 400 });
  }

  try {
    const existing = await db.opdVisit.findUnique({
      where: { id },
      include: {
        receipts: { select: { id: true, receiptNumber: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "OPD visit not found." }, { status: 404 });
    }

    if (existing.receipts.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete this OPD visit because diagnostic receipts have already been issued under it." },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { opdVisitId: id } });
      await tx.opdVisit.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: "CANCEL",
          entity: "OpdVisit",
          entityId: String(id),
          userId: user.id,
          reason,
          beforeJson: JSON.stringify({
            opdNumber: existing.opdNumber,
            dailyToken: existing.dailyToken,
            consultationFee: existing.consultationFee.toString(),
            patientId: existing.patientId,
            doctorId: existing.doctorId,
            slipsReturned: {
              mainDoctorSlip: returnedMainSlip,
              doctorReceipt: returnedDoctorReceipt,
              patientReceipt: returnedPatientReceipt,
            },
          }),
        },
      });
    });

    return NextResponse.json({ success: true, message: "OPD visit deleted successfully." });
  } catch (error) {
    console.error("Unable to delete OPD visit", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete OPD visit." },
      { status: 500 }
    );
  }
}

