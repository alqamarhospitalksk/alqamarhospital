import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { runTransaction } from "../../../lib/transaction";
import {
  ACTIVE_STATUSES,
  ADMISSION_CATEGORIES,
  accrueAdmissionDays,
  admissionBillInclude,
  admissionCategoryLabels,
  allowedRoomCategories,
  localDateKey,
  round2,
  roomCategoryLabels,
  serializeAdmission,
} from "../../../lib/admission";
import { admissionLookups } from "../../../lib/admission-lookups";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];
// null = not sent (use the default); NaN = sent but not a valid amount.
const optionalAmount = (value: unknown) => (value === undefined || value === null || value === "" ? null : Number(value));
const invalidAmount = (value: number | null) => value !== null && (!Number.isFinite(value) || value < 0);
const statusFilters: Record<string, string[]> = {
  ACTIVE: ACTIVE_STATUSES,
  ADMITTED: ["ADMITTED"],
  INVOICED: ["INVOICED"],
  DISCHARGED: ["DISCHARGED"],
  CANCELLED: ["CANCELLED"],
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  // The admission page only needs the form lists (doctors, beds, fees), not the list of stays.
  if (params.get("lookupsOnly") === "1") return NextResponse.json({ lookups: await admissionLookups() });
  const statuses = statusFilters[params.get("status") ?? "ACTIVE"] ?? ACTIVE_STATUSES;

  // Bring every current stay's daily charges up to today before showing running totals.
  const active = await db.admission.findMany({ where: { status: { in: ACTIVE_STATUSES } } });
  for (const admission of active) await accrueAdmissionDays(db, admission);

  const [admissions, counts, lookups] = await Promise.all([
    db.admission.findMany({ where: { status: { in: statuses } }, orderBy: { admittedAt: "desc" }, take: 200, include: admissionBillInclude }),
    db.admission.groupBy({ by: ["status"], _count: { _all: true } }),
    params.get("lookups") === "1" ? admissionLookups() : Promise.resolve(null),
  ]);

  return NextResponse.json({
    admissions: admissions.map((a) => {
      const full = serializeAdmission(a);
      return {
        id: full.id,
        admissionNumber: full.admissionNumber,
        status: full.status,
        category: full.category,
        categoryLabel: full.categoryLabel,
        admittedAt: full.admittedAt,
        invoicedAt: full.invoicedAt,
        dischargedAt: full.dischargedAt,
        patient: { name: full.patient.name, mrNumber: full.patient.mrNumber },
        doctor: { name: full.doctor.name },
        roomLabel: full.roomLabel,
        bill: full.bill,
      };
    }),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    ...(lookups ? { lookups } : {}),
  });
}

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length === 11 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : value;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const category = text(body?.category).toUpperCase();
  const doctorId = Number(body?.doctorId);
  const roomBedId = body?.roomBedId ? Number(body.roomBedId) : null;
  const manualRoomLabel = text(body?.roomLabel);
  const dailyRoomRate = optionalAmount(body?.dailyRoomRate);
  const dailyDoctorFee = optionalAmount(body?.dailyDoctorFee);
  const dailyTechnicianFee = optionalAmount(body?.dailyTechnicianFee);
  const diagnosis = text(body?.diagnosis) || null;
  const notes = text(body?.notes) || null;
  const attendantName = text(body?.attendantName) || null;
  const attendantMobile = text(body?.attendantMobile) ? normalizeMobile(text(body?.attendantMobile)) : null;
  const advanceAmount = optionalAmount(body?.advanceAmount);
  const advanceMethod = text(body?.advanceMethod).toUpperCase();
  // A newborn going to NICU is registered as a new patient right here, then admitted like anyone else.
  const newborn = body?.newborn && typeof body.newborn === "object" ? body.newborn as Record<string, unknown> : null;
  const patientId = newborn ? null : Number(body?.patientId);

  if (!(ADMISSION_CATEGORIES as readonly string[]).includes(category)) return NextResponse.json({ error: "Select the type of admission." }, { status: 400 });
  if (!Number.isInteger(doctorId)) return NextResponse.json({ error: "Select the attending doctor." }, { status: 400 });
  if (newborn && category !== "NICU") return NextResponse.json({ error: "A newborn can only be registered here for a NICU admission." }, { status: 400 });
  if (!newborn && !Number.isInteger(patientId)) return NextResponse.json({ error: "Select the patient (or register the newborn for NICU)." }, { status: 400 });
  if (roomBedId !== null && !Number.isInteger(roomBedId)) return NextResponse.json({ error: "Select a valid room or bed." }, { status: 400 });
  if (roomBedId === null && !manualRoomLabel) return NextResponse.json({ error: "Select a room/bed, or enter the room manually." }, { status: 400 });
  if (roomBedId === null && dailyRoomRate === null) return NextResponse.json({ error: "Enter the daily charge for the manually entered room." }, { status: 400 });
  if ([dailyRoomRate, dailyDoctorFee, dailyTechnicianFee].some(invalidAmount)) return NextResponse.json({ error: "Daily charges must be zero or more." }, { status: 400 });
  if (advanceAmount !== null && (!Number.isFinite(advanceAmount) || advanceAmount < 0)) return NextResponse.json({ error: "Enter a valid advance amount." }, { status: 400 });
  if (advanceAmount && !paymentMethods.includes(advanceMethod)) return NextResponse.json({ error: "Select how the advance is paid." }, { status: 400 });
  if (attendantMobile && !/^03\d{2}-\d{7}$/.test(attendantMobile)) return NextResponse.json({ error: "Invalid attendant mobile number. Expected format: 0300-5676121." }, { status: 400 });

  let newbornData: { name: string; fatherName: string; gender: string; dateOfBirth: Date; mobile: string; address: string | null } | null = null;
  if (newborn) {
    const name = text(newborn.name);
    const fatherName = text(newborn.fatherName);
    const gender = text(newborn.gender);
    const dob = text(newborn.dateOfBirth);
    const mobile = text(newborn.mobile) ? normalizeMobile(text(newborn.mobile)) : "";
    if (!name || !fatherName || !gender) return NextResponse.json({ error: "Enter the baby's name (e.g. Baby of Ayesha), father's name and gender." }, { status: 400 });
    if (dob && Number.isNaN(Date.parse(dob))) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
    if (mobile && !/^03\d{2}-\d{7}$/.test(mobile)) return NextResponse.json({ error: "Invalid mobile number. Expected format: 0300-5676121." }, { status: 400 });
    newbornData = { name, fatherName, gender, dateOfBirth: dob ? new Date(dob) : new Date(), mobile, address: text(newborn.address) || null };
  }

  try {
    const created = await runTransaction(async (transaction) => {
      const doctor = await transaction.doctor.findFirst({ where: { id: doctorId, active: true } });
      if (!doctor) throw new Error("Doctor not found.");

      let patient;
      if (newbornData) {
        // Same MR number format as app/api/patients. The parent's mobile is deliberately not checked
        // for duplicates: a newborn shares it with the mother's own record.
        const record = await transaction.patient.create({
          data: { ...newbornData, mrNumber: `TMP-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`, createdById: user.id },
        });
        patient = await transaction.patient.update({ where: { id: record.id }, data: { mrNumber: `MR-${new Date().getFullYear()}-${String(record.id).padStart(6, "0")}` } });
      } else {
        patient = await transaction.patient.findUnique({ where: { id: patientId! } });
        if (!patient) throw new Error("Patient not found.");
        const current = await transaction.admission.findFirst({ where: { patientId: patient.id, status: { in: ACTIVE_STATUSES } } });
        if (current) throw new Error(`${patient.name} is already admitted (${current.admissionNumber}).`);
      }

      let roomLabel = manualRoomLabel;
      let roomRate = dailyRoomRate ?? 0;
      if (roomBedId !== null) {
        const bed = await transaction.roomBed.findFirst({ where: { id: roomBedId, active: true } });
        if (!bed) throw new Error("That room/bed is not available.");
        if (!allowedRoomCategories[category].includes(bed.category)) {
          throw new Error(`${bed.name} is a ${roomCategoryLabels[bed.category] ?? bed.category} bed. A ${admissionCategoryLabels[category]} admission needs: ${allowedRoomCategories[category].map((c) => roomCategoryLabels[c]).join(" or ")}.`);
        }
        const taken = await transaction.admission.findFirst({ where: { roomBedId, status: { in: ACTIVE_STATUSES } } });
        if (taken) throw new Error(`${bed.name} is occupied (${taken.admissionNumber}).`);
        roomLabel = bed.name;
        roomRate = dailyRoomRate ?? Number(bed.dailyRate);
      }
      const categoryFee = await transaction.admissionCategoryFee.findUnique({ where: { category } });

      const now = new Date();
      const dateKey = localDateKey(now).replaceAll("-", "");
      const sequenceKey = `ADM:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const admissionNumber = `ADM-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;

      const admission = await transaction.admission.create({
        data: {
          admissionNumber,
          patientId: patient.id,
          doctorId,
          category,
          roomBedId,
          roomLabel,
          dailyRoomRate: roomRate,
          dailyDoctorFee: dailyDoctorFee ?? Number(doctor.admissionDailyFee),
          dailyTechnicianFee: dailyTechnicianFee ?? Number(categoryFee?.technicianFee ?? 0),
          admittedAt: now,
          diagnosis,
          notes,
          attendantName,
          attendantMobile,
          createdById: user.id,
        },
      });
      await accrueAdmissionDays(transaction, admission);

      if (advanceAmount && advanceAmount > 0) {
        await transaction.payment.create({
          data: { amount: round2(advanceAmount), method: advanceMethod as "CASH", status: "PAID", note: `Admission advance — ${admissionNumber}`, admissionId: admission.id, createdById: user.id },
        });
      }
      return { admission, patient };
    });

    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Admission",
        entityId: String(created.admission.id),
        userId: user.id,
        afterJson: JSON.stringify({ admissionNumber: created.admission.admissionNumber, patientId: created.patient.id, newborn: Boolean(newbornData), category, roomLabel: created.admission.roomLabel, advanceAmount }),
      },
    });
    return NextResponse.json({ admission: { id: created.admission.id, admissionNumber: created.admission.admissionNumber, patient: { name: created.patient.name, mrNumber: created.patient.mrNumber } } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to admit the patient." }, { status: 409 });
  }
}
