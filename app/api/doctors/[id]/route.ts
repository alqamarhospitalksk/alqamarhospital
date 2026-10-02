import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { parseAvailabilityDays } from "../../../../lib/doctor-availability";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const sharePercent = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : NaN;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const { id } = await context.params;
  const doctorId = Number(id);
  if (!Number.isInteger(doctorId)) return NextResponse.json({ error: "Invalid doctor ID." }, { status: 400 });

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
  const consultationFee = Number(body?.consultationFee);
  const hospitalSplitType = text(body?.hospitalSplitType).toUpperCase() || "PERCENTAGE";
  const hospitalSplitValue = Number(body?.hospitalSplitValue);
  const labSharePercent = sharePercent(body?.labSharePercent);
  const xraySharePercent = sharePercent(body?.xraySharePercent);
  const ultrasoundSharePercent = sharePercent(body?.ultrasoundSharePercent);
  const ecgSharePercent = sharePercent(body?.ecgSharePercent);
  const ecoSharePercent = sharePercent(body?.ecoSharePercent);
  const shares = [labSharePercent, xraySharePercent, ultrasoundSharePercent, ecgSharePercent, ecoSharePercent];

  if (
    !name ||
    !specialization ||
    !availabilityDays.length ||
    !validTime(availabilityFrom) ||
    !validTime(availabilityTo) ||
    availabilityFrom >= availabilityTo ||
    !Number.isFinite(consultationFee) ||
    consultationFee < 0 ||
    !["PERCENTAGE", "FIXED"].includes(hospitalSplitType) ||
    !Number.isFinite(hospitalSplitValue) ||
    hospitalSplitValue < 0
  ) {
    return NextResponse.json({ error: "Provide valid doctor details, availability, fee, and hospital split." }, { status: 400 });
  }
  if (shares.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) {
    return NextResponse.json({ error: "Diagnostic share percentages must be between 0 and 100." }, { status: 400 });
  }

  const doctor = await db.doctor.update({
    where: { id: doctorId },
    data: {
      name,
      specialization,
      nameUrdu,
      specializationUrdu,
      qualifications,
      qualificationsUrdu,
      availability,
      availabilityDays: JSON.stringify(availabilityDays),
      availabilityFrom,
      availabilityTo,
      consultationFee,
      hospitalSplitType,
      hospitalSplitValue,
      labSharePercent,
      xraySharePercent,
      ultrasoundSharePercent,
      ecgSharePercent,
      ecoSharePercent,
    },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "Doctor",
      entityId: String(doctor.id),
      userId: user.id,
      afterJson: JSON.stringify({ name, specialization, consultationFee }),
    },
  });

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
  });
}
