import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { ADMISSION_CATEGORIES, admissionCategoryLabels } from "../../../lib/admission";

async function currentFees() {
  const rows = await db.admissionCategoryFee.findMany();
  return ADMISSION_CATEGORIES.map((category) => ({
    category,
    label: admissionCategoryLabels[category],
    technicianFee: Number(rows.find((r) => r.category === category)?.technicianFee ?? 0),
  }));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT", "OPERATOR"]);
  if (denied) return denied;
  return NextResponse.json({ fees: await currentFees() });
}

// Saves the default technician fee per day for every admission category. New admissions copy it in;
// patients already admitted keep the fee they were admitted with.
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const fees = Array.isArray(body?.fees) ? body.fees as { category?: unknown; technicianFee?: unknown }[] : [];
  const updates = fees.map((f) => ({ category: String(f.category ?? ""), technicianFee: Number(f.technicianFee) }));
  if (updates.length === 0 || updates.some((u) => !(ADMISSION_CATEGORIES as readonly string[]).includes(u.category) || !Number.isFinite(u.technicianFee) || u.technicianFee < 0)) {
    return NextResponse.json({ error: "Enter a technician fee of zero or more for each admission type." }, { status: 400 });
  }

  await db.$transaction(updates.map((u) => db.admissionCategoryFee.upsert({ where: { category: u.category }, create: u, update: { technicianFee: u.technicianFee } })));
  await db.auditLog.create({ data: { action: "UPDATE", entity: "AdmissionCategoryFee", entityId: "all", userId: user.id, afterJson: JSON.stringify(updates) } });
  return NextResponse.json({ fees: await currentFees() });
}
