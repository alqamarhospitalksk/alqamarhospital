import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCnic(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return clean(value);
}

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 11) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return clean(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "MEDICAL_STORE"]);
  if (denied) return denied;

  const { id } = await params;
  const patientId = Number(id);

  if (!patientId) {
    return NextResponse.json({ error: "Invalid patient ID." }, { status: 400 });
  }

  const [patient, opdVisits, testReports, auditLogs] = await Promise.all([
    db.patient.findUnique({ where: { id: patientId } }),
    db.opdVisit.findMany({
      where: { patientId },
      orderBy: { visitDate: "desc" },
      include: { doctor: { select: { name: true } }, payments: { select: { status: true, amount: true, method: true } } },
    }),
    // Every DiagnosticReceipt traces back to an OPD visit for this patient, so querying
    // by patientId directly here gives the full test-report history in one flat list —
    // no need to walk it out of the OPD visits above.
    db.diagnosticReceipt.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        doctor: { select: { name: true } },
        items: { select: { nameAtSale: true, result: true, resultUploadedAt: true } },
      },
    }),
    db.auditLog.findMany({
      where: { entity: "Patient", entityId: String(patientId) },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
  ]);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  return NextResponse.json({ patient, opdVisits, testReports, auditLogs });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const { id } = await params;
  const patientId = Number(id);

  if (!patientId) {
    return NextResponse.json({ error: "Invalid patient ID." }, { status: 400 });
  }

  const existing = await db.patient.findUnique({ where: { id: patientId } });
  if (!existing) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = clean(body?.name);
  const fatherName = clean(body?.fatherName);
  const cnic = normalizeCnic(clean(body?.cnic));
  const rawMobile = clean(body?.mobile);
  const mobile = rawMobile ? normalizeMobile(rawMobile) : "";
  const gender = clean(body?.gender);
  const address = clean(body?.address) || null;
  const dateOfBirth = clean(body?.dateOfBirth);

  if (!name || !fatherName || !gender) {
    return NextResponse.json(
      { error: "Name, father name, and gender are required." },
      { status: 400 }
    );
  }

  if (cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
    return NextResponse.json(
      { error: "Invalid CNIC format. Expected format: 16201-9398413-3." },
      { status: 400 }
    );
  }

  if (mobile) {
    const mobileClean = mobile.replace(/\D/g, "");
    if (!/^03\d{9}$/.test(mobileClean) || mobile.length !== 12) {
      return NextResponse.json(
        { error: "Invalid mobile number. Expected format: 0300-5676121." },
        { status: 400 }
      );
    }
  }

  if (dateOfBirth && Number.isNaN(Date.parse(dateOfBirth))) {
    return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
  }

  const duplicateConditions = [];
  if (cnic) duplicateConditions.push({ cnic });
  if (mobile) duplicateConditions.push({ mobile });

  if (duplicateConditions.length > 0) {
    const duplicate = await db.patient.findFirst({
      where: {
        id: { not: patientId },
        OR: duplicateConditions,
      },
      select: { mrNumber: true, cnic: true },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          error: `Another patient with this ${
            duplicate.cnic === cnic && cnic ? "CNIC" : "mobile number"
          } already exists (${duplicate.mrNumber}).`,
        },
        { status: 409 }
      );
    }
  }

  const updatedPatient = await db.patient.update({
    where: { id: patientId },
    data: {
      name,
      fatherName,
      cnic: cnic || null,
      mobile: mobile || "",
      gender,
      address,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    },
  });

  // Stamp Audit Log
  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "Patient",
      entityId: String(patientId),
      userId: user.id,
      beforeJson: JSON.stringify({
        name: existing.name,
        fatherName: existing.fatherName,
        cnic: existing.cnic,
        mobile: existing.mobile,
        gender: existing.gender,
        address: existing.address,
        dateOfBirth: existing.dateOfBirth,
      }),
      afterJson: JSON.stringify({
        name: updatedPatient.name,
        fatherName: updatedPatient.fatherName,
        cnic: updatedPatient.cnic,
        mobile: updatedPatient.mobile,
        gender: updatedPatient.gender,
        address: updatedPatient.address,
        dateOfBirth: updatedPatient.dateOfBirth,
      }),
    },
  });

  return NextResponse.json({ patient: updatedPatient });
}
