import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "MEDICAL_STORE"]);
  if (denied) return denied;

  const url = new URL(request.url);
  const checkCnic = url.searchParams.get("checkCnic")?.trim();
  const excludeId = Number(url.searchParams.get("excludeId") || 0);

  if (checkCnic) {
    const existing = await db.patient.findFirst({
      where: {
        cnic: checkCnic,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, mrNumber: true, name: true, cnic: true },
    });
    return NextResponse.json({ exists: Boolean(existing), patient: existing });
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  const patients = await db.patient.findMany({
    where: query
      ? {
          OR: [
            { mrNumber: { contains: query } },
            { cnic: { contains: query } },
            { mobile: { contains: query } },
            { name: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      mrNumber: true,
      name: true,
      fatherName: true,
      cnic: true,
      mobile: true,
      dateOfBirth: true,
      gender: true,
      address: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ patients });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

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
    return NextResponse.json({ error: "Name, father name, and gender are required." }, { status: 400 });
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
        OR: duplicateConditions,
      },
      select: { mrNumber: true, name: true, mobile: true, cnic: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: `A patient with this ${duplicate.cnic === cnic && cnic ? "CNIC" : "mobile number"} already exists (${duplicate.mrNumber}).` },
        { status: 409 },
      );
    }
  }

  try {
    const patient = await db.$transaction(async (transaction) => {
      const created = await transaction.patient.create({
        data: {
          // Temporary value, replaced with the real MR number just below. Must fit mr_number (30 characters).
          mrNumber: `TMP-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
          name,
          fatherName,
          cnic: cnic || null,
          mobile: mobile || "",
          gender,
          address,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          createdById: user.id,
        },
      });

      const mrNumber = `MR-${new Date().getFullYear()}-${String(created.id).padStart(6, "0")}`;
      return transaction.patient.update({ where: { id: created.id }, data: { mrNumber } });
    });

    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Patient",
        entityId: String(patient.id),
        userId: user.id,
        afterJson: JSON.stringify({ mrNumber: patient.mrNumber, name: patient.name, mobile: patient.mobile }),
      },
    });

    return NextResponse.json({ patient }, { status: 201 });
  } catch (error) {
    // Logged in full for the server log; the screen gets only a short code (never a password or address).
    console.error("Unable to save the patient", error);
    const code = (error as { code?: string; cause?: { code?: string } } | null)?.cause?.code ?? (error as { code?: string } | null)?.code ?? "UNKNOWN";
    return NextResponse.json({ error: `Unable to save the patient. Please try again. (error ${code})` }, { status: 500 });
  }
}
