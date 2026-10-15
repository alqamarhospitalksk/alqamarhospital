import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { runTransaction } from "../../../../lib/transaction";
import { toDateColumnBoundary } from "../../../../lib/date-range";
import { MEDICINE_PURPOSES, OPEN_OT_STATUSES } from "../../../../lib/admission";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const patientIdParam = new URL(request.url).searchParams.get("patientId");
  const patientId = patientIdParam ? Number(patientIdParam) : null;
  if (patientIdParam && !Number.isInteger(patientId)) return NextResponse.json({ error: "Invalid patient." }, { status: 400 });

  const sales = await db.medicineSale.findMany({
    where: patientId ? { patientId } : undefined,
    orderBy: { id: "desc" },
    take: patientId ? 10 : 50,
    include: { patient: true, items: { include: { medicineItem: true } }, payments: { take: 1 }, admission: { select: { admissionNumber: true } }, otCase: { select: { caseNumber: true } } },
  });

  // Sale Returns needs to know how much of each line item has already been returned, so it
  // can offer only what's still returnable instead of the full original sold quantity again.
  const alreadyReturned = await db.medicineSaleReturnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItem: { saleId: { in: sales.map((s) => s.id) } } },
    _sum: { quantity: true },
  });
  const returnedMap = new Map(alreadyReturned.map((r) => [r.saleItemId, Number(r._sum.quantity ?? 0)]));

  return NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      dailyToken: s.dailyToken,
      createdAt: s.createdAt,
      customerName: s.patient?.name ?? s.customerName ?? "Walk-in",
      mrNumber: s.patient?.mrNumber ?? null,
      subtotal: s.subtotal.toString(),
      discount: s.discount.toString(),
      total: s.total.toString(),
      status: s.status,
      // An in-patient credit sale has no payment until the store marks it paid.
      paymentMethod: s.creditStatus === "UNSETTLED" ? "CREDIT" : s.payments[0]?.method ?? "CASH",
      creditStatus: s.creditStatus,
      purpose: s.purpose,
      // The admission or OT case a credit sale is charged to.
      billNumber: s.admission?.admissionNumber ?? s.otCase?.caseNumber ?? null,
      // costPriceAtSale is intentionally included here for internal use (e.g. future profit
      // reporting) but the printed customer receipt (app/medical-store/sell/page.tsx) only
      // ever reads name/quantity/total from an item — it never surfaces this field.
      items: s.items.map((i) => ({ id: i.id, batchId: i.batchId, name: i.medicineItem.name, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), total: i.total.toString(), costPriceAtSale: i.costPriceAtSale?.toString() ?? null, returnedQuantity: (returnedMap.get(i.id) ?? 0).toString() })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  // In-patient credit issue: medicine for an admitted patient (admissionId) or an OT patient
  // (otCaseId), charged to their stay. No payment and no discount here — the store marks it paid
  // when the patient settles at discharge (In-patients page).
  const admissionId = body?.admissionId ? Number(body.admissionId) : null;
  const otCaseId = !admissionId && body?.otCaseId ? Number(body.otCaseId) : null;
  const credit = admissionId !== null || otCaseId !== null;
  const purpose = text(body?.purpose).toUpperCase();
  let patientId = body?.patientId ? Number(body.patientId) : null;
  const customerName = credit ? null : text(body?.customerName) || null;
  const discount = credit ? 0 : Number(body?.discount ?? 0);
  const discountReason = credit ? null : text(body?.discountReason) || null;
  const paymentMethod = credit ? "CREDIT" : text(body?.paymentMethod) || "CASH";
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];

  const lines: { medicineItemId: number; quantity: number }[] = [];
  for (const raw of rawLines) {
    const record = raw as Record<string, unknown>;
    const medicineItemId = Number(record?.medicineItemId);
    const quantity = Number(record?.quantity);
    if (Number.isInteger(medicineItemId) && Number.isFinite(quantity) && quantity > 0) {
      lines.push({ medicineItemId, quantity });
    }
  }

  if (lines.length === 0) return NextResponse.json({ error: "Add at least one medicine to the sale." }, { status: 400 });
  if (credit && !(MEDICINE_PURPOSES as readonly string[]).includes(purpose)) return NextResponse.json({ error: "Select what the medicine is for (ward, OT or home)." }, { status: 400 });
  if (admissionId !== null) {
    if (!Number.isInteger(admissionId)) return NextResponse.json({ error: "Invalid admission." }, { status: 400 });
    const admission = await db.admission.findUnique({ where: { id: admissionId }, select: { status: true, patientId: true, admissionNumber: true } });
    if (!admission) return NextResponse.json({ error: "Admission not found." }, { status: 404 });
    // Once the final invoice is out the bill is closed, so nothing more can be charged to it.
    if (admission.status !== "ADMITTED") return NextResponse.json({ error: `${admission.admissionNumber} is no longer open for medicine (it is ${admission.status.toLowerCase()}).` }, { status: 409 });
    patientId = admission.patientId;
  }
  if (otCaseId !== null) {
    if (!Number.isInteger(otCaseId)) return NextResponse.json({ error: "Invalid OT case." }, { status: 400 });
    const otCase = await db.otCase.findUnique({ where: { id: otCaseId }, select: { status: true, patientId: true, caseNumber: true, admission: { select: { admissionNumber: true } } } });
    if (!otCase) return NextResponse.json({ error: "OT case not found." }, { status: 404 });
    if (otCase.admission) return NextResponse.json({ error: `${otCase.caseNumber} is part of admission ${otCase.admission.admissionNumber}. Issue the medicine to that admission.` }, { status: 409 });
    if (!OPEN_OT_STATUSES.includes(otCase.status)) return NextResponse.json({ error: `${otCase.caseNumber} is no longer open for medicine (it is ${otCase.status.toLowerCase().replaceAll("_", " ")}).` }, { status: 409 });
    patientId = otCase.patientId;
  }
  if (!patientId && !customerName) return NextResponse.json({ error: "Select a patient or enter a walk-in customer name." }, { status: 400 });
  if (!credit && !methods.includes(paymentMethod)) return NextResponse.json({ error: "Select a valid payment method." }, { status: 400 });
  if (!Number.isFinite(discount) || discount < 0 || (discount > 0 && !discountReason)) {
    return NextResponse.json({ error: "A valid discount amount and reason are required for a discount." }, { status: 400 });
  }

  try {
    const result = await runTransaction(async (transaction) => {
      // Checked again inside the transaction: the operator may have invoiced the stay a moment ago.
      if (admissionId && (await transaction.admission.findUnique({ where: { id: admissionId }, select: { status: true } }))?.status !== "ADMITTED") {
        throw new Error("This admission has just been invoiced; no more medicine can be charged to it.");
      }
      if (otCaseId && !OPEN_OT_STATUSES.includes((await transaction.otCase.findUnique({ where: { id: otCaseId }, select: { status: true } }))?.status ?? "")) {
        throw new Error("This OT case has just been discharged; no more medicine can be charged to it.");
      }
      if (patientId) {
        const patient = await transaction.patient.findUnique({ where: { id: patientId } });
        if (!patient) throw new Error("Patient not found.");
      }

      // FEFO: for each requested medicine, draw from the earliest-expiring batch first,
      // splitting across batches if one alone doesn't cover the requested quantity.
      const saleItemsData: { medicineItemId: number; batchId: number; quantity: number; unitPrice: number; total: number; costPriceAtSale: number }[] = [];
      const stockTransactionsData: { medicineItemId: number; batchId: number; type: "SALE"; quantity: number; beforeQuantity: number; afterQuantity: number; createdById: number }[] = [];

      for (const line of lines) {
        const batches = await transaction.medicineBatch.findMany({
          where: { medicineItemId: line.medicineItemId, quantityRemaining: { gt: 0 }, expiryDate: { gte: new Date() } },
          orderBy: { expiryDate: "asc" },
          include: { medicineItem: true },
        });

        const available = batches.reduce((sum, b) => sum + Number(b.quantityRemaining), 0);
        if (available < line.quantity) {
          const name = batches[0]?.medicineItem.name ?? `medicine #${line.medicineItemId}`;
          throw new Error(`Not enough non-expired stock for ${name} — only ${available} available.`);
        }

        let remaining = line.quantity;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const takeFromBatch = Math.min(remaining, Number(batch.quantityRemaining));
          const unitPrice = batch.salePriceOverride ? Number(batch.salePriceOverride) : Number(batch.medicineItem.salePrice);
          const beforeQuantity = Number(batch.quantityRemaining);
          await transaction.medicineBatch.update({
            where: { id: batch.id },
            data: { quantityRemaining: { decrement: takeFromBatch } },
          });
          saleItemsData.push({
            medicineItemId: line.medicineItemId,
            batchId: batch.id,
            quantity: takeFromBatch,
            unitPrice,
            // Rounded to paisa so the printed line totals always add up to the sale total.
            total: Math.round(takeFromBatch * unitPrice * 100) / 100,
            costPriceAtSale: Number(batch.purchasePrice),
          });
          stockTransactionsData.push({
            medicineItemId: line.medicineItemId,
            batchId: batch.id,
            type: "SALE",
            quantity: takeFromBatch,
            beforeQuantity,
            afterQuantity: beforeQuantity - takeFromBatch,
            createdById: user.id,
          });
          remaining -= takeFromBatch;
        }
      }

      const subtotal = Math.round(saleItemsData.reduce((sum, i) => sum + i.total, 0) * 100) / 100;
      if (discount > subtotal) throw new Error("Discount cannot exceed the subtotal.");
      const total = Math.round((subtotal - discount) * 100) / 100;

      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      // saleDate is a `@db.Date` column: local midnight would be stored as the previous day
      // (see lib/date-range.ts), so anchor it to UTC midnight of the same calendar date.
      const saleDate = toDateColumnBoundary(new Date(`${dateKey}T00:00:00`));
      const sequenceKey = `MEDSALE:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const dailyToken = sequence.nextValue - 1;
      const saleNumber = `MED-${dateKey.replaceAll("-", "")}-${String(dailyToken).padStart(4, "0")}`;

      const sale = await transaction.medicineSale.create({
        data: {
          saleNumber,
          dailyToken,
          saleDate,
          patientId,
          customerName: patientId ? null : customerName,
          subtotal,
          discount,
          discountReason,
          total,
          ...(credit ? { admissionId, otCaseId, purpose, creditStatus: "UNSETTLED" } : {}),
          createdById: user.id,
          items: { create: saleItemsData },
        },
        include: { patient: true, items: { include: { medicineItem: true } }, admission: { select: { admissionNumber: true } }, otCase: { select: { caseNumber: true } } },
      });

      if (!credit) await transaction.payment.create({ data: { amount: total, method: paymentMethod as "CASH", medicineSaleId: sale.id, createdById: user.id } });

      await transaction.medicineStockTransaction.createMany({
        data: stockTransactionsData.map((t) => ({ ...t, referenceType: "MedicineSale", referenceId: sale.id })),
      });

      return sale;
    });

    await db.auditLog.create({
      data: {
        action: discount > 0 ? "DISCOUNT" : "CREATE",
        entity: "MedicineSale",
        entityId: String(result.id),
        userId: user.id,
        reason: discountReason,
        afterJson: JSON.stringify({ saleNumber: result.saleNumber, total: result.total.toString(), ...(credit ? { admissionId, otCaseId, purpose, credit: true } : {}) }),
      },
    });

    return NextResponse.json(
      {
        sale: {
          id: result.id,
          saleNumber: result.saleNumber,
          dailyToken: result.dailyToken,
          subtotal: result.subtotal.toString(),
          discount: result.discount.toString(),
          total: result.total.toString(),
          paymentMethod,
          purpose: result.purpose,
          billNumber: result.admission?.admissionNumber ?? result.otCase?.caseNumber ?? null,
          customerName: result.patient?.name ?? result.customerName ?? "Walk-in",
          mrNumber: result.patient?.mrNumber ?? null,
          // costPriceAtSale rides along here for the on-screen post-sale preview's hover
          // reveal (staff-only) — the printed receipt is a separate hand-built HTML string
          // that only ever reads name/quantity/total, so this never reaches the customer.
          items: result.items.map((i) => ({ name: i.medicineItem.name, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), total: i.total.toString(), costPriceAtSale: i.costPriceAtSale?.toString() ?? null })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the sale." }, { status: 409 });
  }
}
