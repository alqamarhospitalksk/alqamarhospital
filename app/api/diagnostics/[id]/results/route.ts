import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { serializeResultItem } from "../../../../../lib/lab-catalog";
import { QUALITATIVE_OPTIONS, alternateValue, computeFlag, referenceText } from "../../../../../lib/lab-results";

const receiptInclude = {
  patient: true,
  doctor: true,
  items: {
    orderBy: { id: "asc" as const },
    include: {
      resultValues: { orderBy: { sortOrder: "asc" as const } },
      catalogItem: { include: { parameters: { orderBy: { sortOrder: "asc" as const } } } },
    },
  },
};

async function authorize(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (user.role !== "LAB" && user.role !== "MANAGEMENT") {
    return { error: NextResponse.json({ error: "Lab access is required to enter results." }, { status: 403 }) };
  }
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId)) return { error: NextResponse.json({ error: "Invalid receipt ID." }, { status: 400 }) };
  const receipt = await db.diagnosticReceipt.findUnique({ where: { id: receiptId }, include: receiptInclude });
  if (!receipt) return { error: NextResponse.json({ error: "Receipt not found." }, { status: 404 }) };
  // The Lab role only handles Laboratory tests — X-Ray, ECG, ECO, and Ultrasound need the
  // patient present for the procedure, so those results aren't entered remotely.
  if (receipt.module !== "LABORATORY" && user.role === "LAB") {
    return { error: NextResponse.json({ error: "The Lab role can only enter results for Laboratory tests." }, { status: 403 }) };
  }
  return { user, receipt };
}

type Receipt = NonNullable<Awaited<ReturnType<typeof loadReceipt>>>;
const loadReceipt = (receiptId: number) => db.diagnosticReceipt.findUnique({ where: { id: receiptId }, include: receiptInclude });

function describe(receipt: Receipt) {
  const items = receipt.items.map((item) => ({
    ...serializeResultItem(item),
    defaultRemarks: item.catalogItem.defaultRemarks,
    template: item.catalogItem.parameters.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      unit: p.unit,
      altUnit: p.altUnit,
      altFactor: p.altFactor?.toString() ?? null,
      referenceText: referenceText(p),
    })),
  }));
  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    module: receipt.module,
    moduleToken: receipt.moduleToken,
    patient: { name: receipt.patient.name, mrNumber: receipt.patient.mrNumber, gender: receipt.patient.gender },
    doctor: { name: receipt.doctor.name },
    resultStatus: items.length > 0 && items.every((i) => i.done) ? "DONE" : "PENDING",
    items,
  };
}

// Everything the Lab entry screen needs: each test's template plus anything already saved.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize((await context.params).id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(describe(auth.receipt));
}

type Entry = { itemId?: unknown; result?: unknown; remarks?: unknown; values?: unknown };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize((await context.params).id);
  if ("error" in auth) return auth.error;
  const { user, receipt } = auth;

  const body = await request.json().catch(() => null);
  const rawEntries: Entry[] = Array.isArray(body?.results) ? body.results : [];

  type Plan = {
    itemId: number;
    name: string;
    remarks: string | undefined;
    result: string | undefined;
    rows: {
      parameterId: number;
      sortOrder: number;
      kind: string;
      name: string;
      unit: string | null;
      altUnit: string | null;
      altValue: string | null;
      referenceText: string | null;
      value: string;
      flag: string | null;
    }[];
  };
  const plans: Plan[] = [];

  for (const entry of rawEntries) {
    const item = receipt.items.find((i) => i.id === Number(entry?.itemId));
    if (!item) continue;
    const remarks = typeof entry.remarks === "string" ? entry.remarks.trim().slice(0, 500) : undefined;
    const template = item.catalogItem.parameters;
    const hasTemplate = template.some((p) => p.kind !== "HEADING");

    if (!hasTemplate) {
      const result = typeof entry.result === "string" ? entry.result.trim() : "";
      if (result) plans.push({ itemId: item.id, name: item.nameAtSale, remarks, result, rows: [] });
      continue;
    }

    const submitted = new Map<number, string>();
    if (Array.isArray(entry.values)) {
      for (const v of entry.values as { parameterId?: unknown; value?: unknown }[]) {
        if (typeof v?.value === "string") submitted.set(Number(v.parameterId), v.value.trim());
      }
    }

    const rows: Plan["rows"] = [];
    let pendingHeading: (typeof template)[number] | null = null;
    for (const param of template) {
      if (param.kind === "HEADING") {
        pendingHeading = param;
        continue;
      }
      const value = submitted.get(param.id) ?? "";
      if (!value) continue;
      if (param.kind === "NUMERIC" && !Number.isFinite(Number(value))) {
        return NextResponse.json({ error: `"${param.name}" in ${item.nameAtSale} must be a number.` }, { status: 400 });
      }
      if (param.kind === "QUALITATIVE" && !(QUALITATIVE_OPTIONS as readonly string[]).includes(value)) {
        return NextResponse.json({ error: `"${param.name}" in ${item.nameAtSale} must be Positive or Negative.` }, { status: 400 });
      }
      if (pendingHeading) {
        rows.push({ parameterId: pendingHeading.id, sortOrder: rows.length, kind: "HEADING", name: pendingHeading.name, unit: null, altUnit: null, altValue: null, referenceText: null, value: "", flag: null });
        pendingHeading = null;
      }
      rows.push({
        parameterId: param.id,
        sortOrder: rows.length,
        kind: param.kind,
        name: param.name,
        unit: param.unit,
        altUnit: param.altUnit,
        altValue: alternateValue(param, value),
        referenceText: referenceText(param),
        value: value.slice(0, 300),
        flag: computeFlag(param, value),
      });
    }
    if (rows.length > 0) plans.push({ itemId: item.id, name: item.nameAtSale, remarks, result: undefined, rows });
  }

  if (plans.length === 0) {
    return NextResponse.json({ error: "Enter a result for at least one test." }, { status: 400 });
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const plan of plans) {
      // Saving again replaces that test's earlier values, so corrections never leave stale rows.
      await tx.diagnosticResultValue.deleteMany({ where: { receiptItemId: plan.itemId } });
      if (plan.rows.length > 0) {
        await tx.diagnosticResultValue.createMany({ data: plan.rows.map((row) => ({ ...row, receiptItemId: plan.itemId })) });
      }
      await tx.diagnosticReceiptItem.update({
        where: { id: plan.itemId },
        data: {
          ...(plan.result === undefined ? {} : { result: plan.result }),
          ...(plan.remarks === undefined ? {} : { remarks: plan.remarks || null }),
          resultUploadedAt: now,
          resultUploadedById: user.id,
        },
      });
    }
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "DiagnosticReceiptItem",
      entityId: String(receipt.id),
      userId: user.id,
      afterJson: JSON.stringify({ receiptNumber: receipt.receiptNumber, testsEntered: plans.map((p) => p.name) }),
    },
  });

  const refreshed = await loadReceipt(receipt.id);
  return NextResponse.json({ ...describe(refreshed!), updatedTests: plans.map((p) => p.name) });
}
