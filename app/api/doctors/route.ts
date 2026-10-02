import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { parseAvailabilityDays } from "../../../lib/doctor-availability";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const sharePercent = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : NaN;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const doctors = await db.doctor.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, specialization: true, nameUrdu: true, specializationUrdu: true, qualifications: true, qualificationsUrdu: true,
      availability: true, availabilityDays: true, availabilityFrom: true, availabilityTo: true,
      consultationFee: true, hospitalSplitType: true, hospitalSplitValue: true,
      labSharePercent: true, xraySharePercent: true, ultrasoundSharePercent: true, ecgSharePercent: true, ecoSharePercent: true,
    },
  });

  return NextResponse.json({
    doctors: doctors.map((doctor) => ({
      ...doctor,
      availabilityDays: parseAvailabilityDays(doctor.availabilityDays),
      consultationFee: doctor.consultationFee.toString(),
      hospitalSplitValue: doctor.hospitalSplitValue.toString(),
      labSharePercent: doctor.labSharePercent.toString(),
      xraySharePercent: doctor.xraySharePercent.toString(),
      ultrasoundSharePercent: doctor.ultrasoundSharePercent.toString(),
      ecgSharePercent: doctor.ecgSharePercent.toString(),
      ecoSharePercent: doctor.ecoSharePercent.toString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const specialization = text(body?.specialization);
  const nameUrdu = text(body?.nameUrdu) || null;
  const specializationUrdu = text(body?.specializationUrdu) || null;
  const qualifications = text(body?.qualifications) || null;
  const qualificationsUrdu = text(body?.qualificationsUrdu) || null;
  const availabilityDays = parseAvailabilityDays(body?.availabilityDays);
  const availabilityFrom = text(body?.availabilityFrom);
  const availabilityTo = text(body?.availabilityTo);
  const availability = availabilityDays.length && availabilityFrom && availabilityTo ? `${availabilityDays.join(",")} ${availabilityFrom}-${availabilityTo}` : null;
  const fee = Number(body?.consultationFee);
  const splitType = text(body?.hospitalSplitType) || "PERCENTAGE";
  const splitValue = Number(body?.hospitalSplitValue);
  const labSharePercent = sharePercent(body?.labSharePercent);
  const xraySharePercent = sharePercent(body?.xraySharePercent);
  const ultrasoundSharePercent = sharePercent(body?.ultrasoundSharePercent);
  const ecgSharePercent = sharePercent(body?.ecgSharePercent);
  const ecoSharePercent = sharePercent(body?.ecoSharePercent);
  const shares = [labSharePercent, xraySharePercent, ultrasoundSharePercent, ecgSharePercent, ecoSharePercent];

  if (!name || !specialization || !availabilityDays.length || !validTime(availabilityFrom) || !validTime(availabilityTo) || availabilityFrom >= availabilityTo || !Number.isFinite(fee) || fee < 0 || !Number.isFinite(splitValue) || splitValue < 0) {
    return NextResponse.json({ error: "Enter valid doctor details, availability, and fee values." }, { status: 400 });
  }
  if (!["PERCENTAGE", "FIXED"].includes(splitType)) return NextResponse.json({ error: "Invalid split type." }, { status: 400 });
  if (splitType === "PERCENTAGE" && splitValue > 100) return NextResponse.json({ error: "Percentage split cannot exceed 100." }, { status: 400 });
  if (shares.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) {
    return NextResponse.json({ error: "Diagnostic share percentages must be between 0 and 100." }, { status: 400 });
  }

  const doctor = await db.doctor.create({
    data: {
      name, specialization, nameUrdu, specializationUrdu, qualifications, qualificationsUrdu,
      availability, availabilityDays: JSON.stringify(availabilityDays), availabilityFrom, availabilityTo,
      consultationFee: fee, hospitalSplitType: splitType, hospitalSplitValue: splitValue,
      labSharePercent, xraySharePercent, ultrasoundSharePercent, ecgSharePercent, ecoSharePercent,
    },
  });
  await db.auditLog.create({ data: { action: "CREATE", entity: "Doctor", entityId: String(doctor.id), userId: user.id, afterJson: JSON.stringify({ name, specialization, consultationFee: fee }) } });

  return NextResponse.json({
    doctor: {
      ...doctor,
      availabilityDays,
      consultationFee: doctor.consultationFee.toString(),
      hospitalSplitValue: doctor.hospitalSplitValue.toString(),
      labSharePercent: doctor.labSharePercent.toString(),
      xraySharePercent: doctor.xraySharePercent.toString(),
      ultrasoundSharePercent: doctor.ultrasoundSharePercent.toString(),
      ecgSharePercent: doctor.ecgSharePercent.toString(),
      ecoSharePercent: doctor.ecoSharePercent.toString(),
    },
  }, { status: 201 });
}
