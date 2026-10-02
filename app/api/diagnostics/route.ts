import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { runTransaction } from "../../../lib/transaction";
import { toDateColumnBoundary } from "../../../lib/date-range";

const modules = ["LABORATORY", "ECO", "X-RAY", "ECG", "ULTRASOUND"] as const;
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function money(value: { toString(): string }) { return value.toString(); }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const serviceModule = text(params.get("module")).toUpperCase();
  const opdNumber = text(params.get("opdNumber"));
  const fetchHistory = params.get("history") === "true";

  if (fetchHistory) {
    const receipts = await db.diagnosticReceipt.findMany({
      orderBy: { id: "desc" },
      take: 40,
      include: {
        patient: true,
        doctor: true,
        items: true,
        payments: true,
        opdVisit: true,
      },
    });

    return NextResponse.json({
      receipts: receipts.filter((r) => r.patient != null && r.doctor != null && r.opdVisit != null).map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        module: r.module,
        moduleToken: r.moduleToken,
        subtotal: money(r.subtotal),
        discount: money(r.discount),
        discountReason: r.discountReason,
        total: money(r.total),
        paymentMethod: r.payments[0]?.method ?? "CASH",
        status: r.status,
        result: r.result,
        createdAt: r.createdAt,
        opdNumber: r.opdVisit.opdNumber,
        patient: {
          name: r.patient.name,
          mrNumber: r.patient.mrNumber,
          fatherName: r.patient.fatherName,
          gender: r.patient.gender,
        },
        doctor: {
          name: r.doctor.name,
          specialization: r.doctor.specialization,
        },
        items: r.items.map((i) => ({ name: i.nameAtSale, price: money(i.priceAtSale) })),
      })),
    });
  }

  // Search-as-you-type for the OPD box: match OPD number, patient name or MR number, newest first.
  const search = text(params.get("search"));
  if (search) {
    const matches = await db.opdVisit.findMany({
      where: {
        OR: [
          { opdNumber: { contains: search } },
          { patient: { name: { contains: search } } },
          { patient: { mrNumber: { contains: search } } },
        ],
      },
      orderBy: { id: "desc" },
      take: 10,
      include: { patient: true, doctor: true },
    });
    return NextResponse.json({
      visits: matches
        .filter((v) => v.patient != null && v.doctor != null)
        .map((v) => ({
          opdNumber: v.opdNumber,
          visitDate: v.visitDate,
          patientName: v.patient!.name,
          mrNumber: v.patient!.mrNumber,
          doctorName: v.doctor!.name,
        })),
    });
  }

  if (!modules.includes(serviceModule as (typeof modules)[number])) {
    return NextResponse.json({ error: "Select a valid diagnostic module." }, { status: 400 });
  }

  const [catalog, visit] = await Promise.all([
    db.diagnosticCatalogItem.findMany({ where: { module: serviceModule, active: true }, orderBy: { name: "asc" } }),
    opdNumber ? db.opdVisit.findUnique({ where: { opdNumber }, include: { patient: true, doctor: true } }) : null,
  ]);

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const todayVisits = await db.opdVisit.findMany({
    where: { visitDate: { gte: toDateColumnBoundary(startOfToday), lt: toDateColumnBoundary(startOfTomorrow) } },
    orderBy: { id: "desc" },
    include: { patient: true, doctor: true },
  });

  return NextResponse.json({
    catalog: catalog.map((item) => ({ id: item.id, name: item.name, price: money(item.price) })),
    visit: visit
      ? {
          opdNumber: visit.opdNumber,
          patient: { name: visit.patient?.name ?? "Unknown", mrNumber: visit.patient?.mrNumber ?? "" },
          doctor: { name: visit.doctor?.name ?? "Unknown", specialization: visit.doctor?.specialization ?? "" },
        }
      : null,
    todayVisits: todayVisits
      .filter((item) => item.patient != null && item.doctor != null)
      .map((item) => ({
        opdNumber: item.opdNumber,
        patientName: item.patient?.name ?? "Unknown",
        mrNumber: item.patient?.mrNumber ?? "",
        doctorName: item.doctor?.name ?? "Unknown",
      })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const serviceModule = text(body?.module).toUpperCase();
  const opdNumber = text(body?.opdNumber);
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
  const paymentMethod = text(body?.paymentMethod) || "CASH";
  const discount = Number(body?.discount ?? 0);
  const discountReason = text(body?.discountReason) || null;

  if (!modules.includes(serviceModule as (typeof modules)[number]) || !opdNumber || itemIds.length === 0 || !methods.includes(paymentMethod as (typeof methods)[number])) {
    return NextResponse.json({ error: "Select an OPD number, tests, and valid payment method." }, { status: 400 });
  }
  if (!Number.isFinite(discount) || discount < 0 || (!discountReason && discount > 0)) {
    return NextResponse.json({ error: "A valid discount amount and reason note are required for discounts." }, { status: 400 });
  }

  const receipt = await runTransaction(async (transaction) => {
    const visit = await transaction.opdVisit.findUnique({ where: { opdNumber }, include: { patient: true, doctor: true } });
    if (!visit) throw new Error("OPD number not found.");
    if (!visit.patient || !visit.doctor) throw new Error("OPD visit is missing associated patient or doctor record.");
    const items = await transaction.diagnosticCatalogItem.findMany({ where: { id: { in: itemIds }, module: serviceModule, active: true } });
    if (items.length !== itemIds.length) throw new Error("One or more selected tests are unavailable.");

    const subtotal = items.reduce((sum, item) => sum + Number(item.price), 0);
    if (discount > subtotal) throw new Error("Discount cannot exceed the subtotal.");
    const total = subtotal - discount;
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const sequenceKey = `DIAGNOSTIC:${serviceModule}:${dateKey}`;
    const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
    const moduleToken = sequence.nextValue - 1;
    const receiptNumber = `${serviceModule.slice(0, 3)}-${dateKey.replaceAll("-", "")}-${String(moduleToken).padStart(4, "0")}`;

    const created = await transaction.diagnosticReceipt.create({
      data: {
        receiptNumber,
        module: serviceModule,
        moduleToken,
        opdVisitId: visit.id,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        subtotal,
        discount,
        discountReason,
        total,
        createdById: user.id,
        items: { create: items.map((item) => ({ catalogItemId: item.id, nameAtSale: item.name, priceAtSale: item.price })) },
        payments: { create: { amount: total, method: paymentMethod as "CASH", createdById: user.id } },
      },
      include: { items: true, payments: true },
    });
    return { created, visit };
  }).catch((error: unknown) => { throw new Error(error instanceof Error ? error.message : "Unable to create receipt."); });

  await db.auditLog.create({
    data: {
      action: discount > 0 ? "DISCOUNT" : "CREATE",
      entity: "DiagnosticReceipt",
      entityId: String(receipt.created.id),
      userId: user.id,
      reason: discountReason,
      afterJson: JSON.stringify({ receiptNumber: receipt.created.receiptNumber, module: serviceModule, total: receipt.created.total.toString(), discount }),
    },
  });

  return NextResponse.json(
    {
      receipt: {
        id: receipt.created.id,
        receiptNumber: receipt.created.receiptNumber,
        module: serviceModule,
        moduleToken: receipt.created.moduleToken,
        subtotal: money(receipt.created.subtotal),
        discount: money(receipt.created.discount),
        discountReason: receipt.created.discountReason,
        total: money(receipt.created.total),
        paymentMethod: receipt.created.payments[0]?.method ?? paymentMethod,
        status: receipt.created.status,
        opdNumber: receipt.visit.opdNumber,
        patient: { name: receipt.visit.patient?.name ?? "Unknown", mrNumber: receipt.visit.patient?.mrNumber ?? "" },
        doctor: { name: receipt.visit.doctor?.name ?? "Unknown" },
        items: receipt.created.items.map((item) => ({ name: item.nameAtSale, price: money(item.priceAtSale) })),
      },
    },
    { status: 201 }
  );
}
