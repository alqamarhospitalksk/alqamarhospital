import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

// ~7MB decoded PDF, expressed as a base64-length ceiling (base64 is ~4/3 the binary size).
const MAX_BASE64_FILE_LENGTH = 10_000_000;

type ResultEntry = { itemId: number; result: string; fileName: string; fileDataUrl: string };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "LAB" && user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Lab access is required to upload results." }, { status: 403 });
  }

  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId)) return NextResponse.json({ error: "Invalid receipt ID." }, { status: 400 });

  const receipt = await db.diagnosticReceipt.findUnique({
    where: { id: receiptId },
    include: { items: true, patient: true },
  });
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  // The Lab role only handles Laboratory test results — X-Ray, ECG, ECO, and Ultrasound
  // require the patient to be present for the procedure, so those aren't uploaded remotely.
  if (receipt.module !== "LABORATORY" && user.role === "LAB") {
    return NextResponse.json({ error: "The Lab role can only upload results for Laboratory tests." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rawEntries = Array.isArray(body?.results) ? body.results : [];
  const entries: ResultEntry[] = [];
  for (const entry of rawEntries) {
    const record = entry as { itemId?: unknown; result?: unknown; fileName?: unknown; fileDataUrl?: unknown };
    const itemId = Number(record?.itemId);
    const result = typeof record?.result === "string" ? record.result.trim() : "";
    const fileName = typeof record?.fileName === "string" ? record.fileName.trim().slice(0, 255) : "";
    const fileDataUrl = typeof record?.fileDataUrl === "string" ? record.fileDataUrl : "";

    if (!Number.isInteger(itemId)) continue;
    if (!result && !fileDataUrl) continue;

    if (fileDataUrl) {
      if (!/^data:application\/pdf;base64,/.test(fileDataUrl)) {
        return NextResponse.json({ error: "Result files must be PDF documents." }, { status: 400 });
      }
      if (fileDataUrl.length > MAX_BASE64_FILE_LENGTH) {
        return NextResponse.json({ error: "Result PDF is too large (max ~7MB)." }, { status: 400 });
      }
    }

    entries.push({ itemId, result, fileName, fileDataUrl });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Enter a result or attach a PDF for at least one test." }, { status: 400 });
  }

  const validItemIds = new Set(receipt.items.map((item) => item.id));
  const toUpdate = entries.filter((entry) => validItemIds.has(entry.itemId));
  if (toUpdate.length === 0) {
    return NextResponse.json({ error: "None of the submitted tests belong to this receipt." }, { status: 400 });
  }

  const now = new Date();
  const updatedNames = await db.$transaction(async (tx) => {
    const names: string[] = [];
    for (const entry of toUpdate) {
      const item = await tx.diagnosticReceiptItem.update({
        where: { id: entry.itemId },
        data: {
          ...(entry.result ? { result: entry.result } : {}),
          ...(entry.fileDataUrl ? { resultFileDataUrl: entry.fileDataUrl, resultFileName: entry.fileName || "result.pdf" } : {}),
          resultUploadedAt: now,
          resultUploadedById: user.id,
        },
      });
      names.push(item.nameAtSale);
    }
    return names;
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entity: "DiagnosticReceiptItem",
      entityId: String(receiptId),
      userId: user.id,
      afterJson: JSON.stringify({ receiptNumber: receipt.receiptNumber, testsUploaded: updatedNames }),
    },
  });

  const refreshed = await db.diagnosticReceiptItem.findMany({ where: { receiptId } });
  const resultStatus = refreshed.length > 0 && refreshed.every((item) => item.result || item.resultFileDataUrl) ? "DONE" : "PENDING";

  return NextResponse.json({
    receiptId,
    receiptNumber: receipt.receiptNumber,
    module: receipt.module,
    moduleToken: receipt.moduleToken,
    patient: receipt.patient ? { name: receipt.patient.name, mrNumber: receipt.patient.mrNumber } : null,
    updatedTests: updatedNames,
    resultStatus,
    items: refreshed.map((item) => ({
      id: item.id,
      name: item.nameAtSale,
      result: item.result,
      resultFileName: item.resultFileName,
      hasResultFile: Boolean(item.resultFileDataUrl),
      resultUploadedAt: item.resultUploadedAt,
    })),
  });
}
