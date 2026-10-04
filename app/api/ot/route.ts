import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { runTransaction } from "../../../lib/transaction";
import { parseAvailabilityDays } from "../../../lib/doctor-availability";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "DUE"];
const money = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;
  const [patients, doctors, beds, cases] = await Promise.all([
    db.patient.findMany({ orderBy: { name: "asc" }, take: 100, select: { id: true, mrNumber: true, name: true } }),
    db.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, specialization: true, consultationFee: true, availability: true, availabilityDays: true, availabilityFrom: true, availabilityTo: true } }),
    // Kept only as a convenience suggestion list (room name / typical daily rate) for the
    // manual Room field below — the OT form no longer requires picking a pre-configured bed.
    db.roomBed.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.otCase.findMany({ where: { status: { not: "DISCHARGED" } }, orderBy: { createdAt: "desc" }, take: 25, include: { patient: true, doctor: true, roomBed: true } }),
  ]);
  return NextResponse.json({
    patients,
    doctors: doctors.map((doctor) => ({ ...doctor, availabilityDays: parseAvailabilityDays(doctor.availabilityDays), consultationFee: doctor.consultationFee.toString() })),
    beds: beds.map((bed) => ({ id: bed.id, name: bed.name, roomType: bed.roomType, dailyRate: bed.dailyRate.toString() })),
    cases: cases
      .filter((item) => item.patient != null && item.doctor != null)
      .map((item) => ({
        id: item.id,
        caseNumber: item.caseNumber,
        status: item.status,
        admissionDate: item.admissionDate,
        patient: { name: item.patient.name, mrNumber: item.patient.mrNumber },
        doctor: { name: item.doctor.name },
        roomBed: { name: item.roomLabel ?? item.roomBed?.name ?? "—" },
        total: item.total.toString(),
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
  const roomLabel = text(body?.roomLabel);
  const theaterFee = money(body?.theaterFee);
  const doctorFeeOverride = body?.doctorFee !== undefined && body.doctorFee !== "" ? Number(body.doctorFee) : null;
  const anesthesiaFee = money(body?.anesthesiaFee);
  const roomFee = money(body?.roomFee);
  const hospitalFee = money(body?.hospitalFee);
  const otMedicineFee = money(body?.otMedicineFee);
  const otMedicineNote = text(body?.otMedicineNote) || null;
  const homeMedicineFee = money(body?.homeMedicineFee);
  const homeMedicineNote = text(body?.homeMedicineNote) || null;
  const recommendations = text(body?.recommendations) || null;
  const procedureName = text(body?.procedureName) || null;
  const diagnosis = text(body?.diagnosis) || null;
  const procedureAt = text(body?.procedureAt);
  // No fallback default here on purpose — a payment method must be explicitly chosen
  // so a case can never silently end up marked "paid" when nothing was collected.
  const paymentMethod = text(body?.paymentMethod);
  // How much is handed over at admission. Left out = the whole bill. A smaller amount is an advance:
  // the rest stays as the case balance and is collected later with "Record Payment", in any number of parts.
  const paidNowRaw = body?.paidNow !== undefined && body.paidNow !== null && body.paidNow !== "" ? Number(body.paidNow) : null;

  if (![patientId, doctorId].every(Number.isInteger) || !roomLabel || !methods.includes(paymentMethod)) {
    return NextResponse.json({ error: "Select a patient, doctor, enter a room/bed, and a valid payment method." }, { status: 400 });
  }
  if (procedureAt && Number.isNaN(Date.parse(procedureAt))) return NextResponse.json({ error: "Enter a valid procedure date and time." }, { status: 400 });
  const currentDoctor = await db.doctor.findFirst({ where: { id: doctorId, active: true } });
  if (!currentDoctor) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });

  try {
    const created = await runTransaction(async (transaction) => {
      const [patient, doctor] = await Promise.all([
        transaction.patient.findUnique({ where: { id: patientId } }),
        transaction.doctor.findFirst({ where: { id: doctorId, active: true } }),
      ]);
      if (!patient || !doctor) throw new Error("Patient or doctor not found.");
      const _now = new Date();
      const dateKey = `${_now.getFullYear()}${String(_now.getMonth() + 1).padStart(2, "0")}${String(_now.getDate()).padStart(2, "0")}`;
      const sequenceKey = `OT:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const caseNumber = `OT-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
      const doctorFee = doctorFeeOverride !== null && Number.isFinite(doctorFeeOverride) && doctorFeeOverride >= 0 ? doctorFeeOverride : 0;
      const total = doctorFee + theaterFee + anesthesiaFee + roomFee + hospitalFee + otMedicineFee + homeMedicineFee;
      const createdCase = await transaction.otCase.create({
        data: {
          caseNumber,
          patientId,
          doctorId,
          roomLabel,
          admissionDate: new Date(),
          procedureAt: procedureAt ? new Date(procedureAt) : null,
          doctorFee,
          theaterFee,
          anesthesiaFee,
          roomFee,
          hospitalFee,
          otMedicineFee,
          otMedicineNote,
          homeMedicineFee,
          homeMedicineNote,
          recommendations,
          total,
          procedureName,
          diagnosis,
          createdById: user.id,
          // lastInvoicedAt stays null until the admission slip is actually printed
          // (not just opened) — that's what later decides whether "View Invoice"
          // shows the full bill again or only what's new since that slip.
        },
      });
      // The full amount is normally charged upfront at admission — the itemized fees
      // above are just how that charge is broken down, not separate later payments.
      // "DUE" means the patient couldn't pay yet, so no payment is recorded here —
      // staff record it later via the Record Payment action once it's actually collected.
      if (paymentMethod !== "DUE") {
        const received = paidNowRaw === null ? total : Math.round(paidNowRaw * 100) / 100;
        if (!Number.isFinite(received) || received <= 0) throw new Error("Enter the amount received now, or choose Due if nothing is paid yet.");
        if (received > total + 0.005) throw new Error(`The amount received (PKR ${received}) is more than the bill (PKR ${total}).`);
        await transaction.payment.create({
          data: {
            amount: received,
            method: paymentMethod as "CASH",
            status: "PAID",
            note: received < total ? `OT admission ${createdCase.caseNumber} — advance, balance PKR ${Math.round((total - received) * 100) / 100}` : `OT admission ${createdCase.caseNumber}`,
            otCaseId: createdCase.id,
            createdById: user.id,
          },
        });
      }
      return { createdCase, patient, doctor };
    });
    await db.auditLog.create({ data: { action: "CREATE", entity: "OtCase", entityId: String(created.createdCase.id), userId: user.id, afterJson: JSON.stringify({ caseNumber: created.createdCase.caseNumber, patientId, roomLabel, paymentMethod, paidNow: paidNowRaw }) } });
    return NextResponse.json({ case: { id: created.createdCase.id, caseNumber: created.createdCase.caseNumber, total: created.createdCase.total.toString(), patient: { name: created.patient.name, mrNumber: created.patient.mrNumber }, doctor: { name: created.doctor.name }, roomBed: { name: roomLabel } } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to admit patient." }, { status: 409 });
  }
}
