import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";
import { toDateColumnBoundary } from "../../../../lib/date-range";
import { isItemDone } from "../../../../lib/lab-results";
import { paymentInclude, paymentSource, serviceLabels } from "../../../../lib/payment-source";
import { ACTIVE_STATUSES } from "../../../../lib/admission";
import { isDoctorAvailable, parseAvailabilityDays } from "../../../../lib/doctor-availability";

// The front desk's view of today: counts of what came through the counter, what is still
// waiting (lab results, discharges, open OT cases) and the money the desk took. It deliberately
// leaves out doctor shares, expenses and net revenue, which are management's figures.

// Services paid at the front desk. Medicine is paid at the store's own counter.
const DESK_SOURCES = ["OPD", "LABORATORY", "X-RAY", "ULTRASOUND", "ECG", "ECO", "OT", "ADMISSION", "EMERGENCY"];
const TEST_MODULES = ["LABORATORY", "X-RAY", "ULTRASOUND", "ECG", "ECO"];

const amount = (value: { toString(): string }) => Number(value.toString());

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  // The server runs in Asia/Karachi (instrumentation.ts), so local midnight is the clinic's day.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dateColStart = toDateColumnBoundary(start);
  const dateColEnd = toDateColumnBoundary(end);

  const [visits, newPatients, receipts, emergencies, inHouse, awaitingDischarge, admittedToday, dischargedToday, otOpen, otNewToday, otDischargedToday, payments, doctors] = await Promise.all([
    db.opdVisit.findMany({
      where: { visitDate: { gte: dateColStart, lt: dateColEnd } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        dailyToken: true,
        doctorId: true,
        patient: { select: { name: true, mrNumber: true, createdAt: true } },
        doctor: { select: { name: true } },
        payments: { orderBy: { id: "asc" }, take: 1, select: { method: true } },
      },
    }),
    db.patient.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.diagnosticReceipt.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        receiptNumber: true,
        module: true,
        createdAt: true,
        printedAt: true,
        admissionId: true,
        patient: { select: { name: true, mrNumber: true } },
        items: { select: { nameAtSale: true, result: true, resultValues: { select: { kind: true, value: true } } } },
      },
    }),
    db.emergencyVisit.findMany({
      where: { visitDate: { gte: dateColStart, lt: dateColEnd } },
      select: { id: true, createdAt: true, dailyToken: true, reason: true, patient: { select: { name: true, mrNumber: true } } },
    }),
    db.admission.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.admission.count({ where: { status: "INVOICED" } }),
    db.admission.findMany({
      where: { admittedAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { id: true, admissionNumber: true, admittedAt: true, roomLabel: true, patient: { select: { name: true, mrNumber: true } } },
    }),
    db.admission.count({ where: { status: "DISCHARGED", dischargedAt: { gte: start, lt: end } } }),
    db.otCase.groupBy({ by: ["status"], where: { status: { in: ["BOOKED", "IN_PROGRESS", "READY_FOR_DISCHARGE"] } }, _count: { _all: true } }),
    db.otCase.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { id: true, caseNumber: true, createdAt: true, procedureName: true, patient: { select: { name: true, mrNumber: true } } },
    }),
    db.otCase.count({ where: { status: "DISCHARGED", dischargeDate: { gte: start, lt: end } } }),
    db.payment.findMany({ where: { createdAt: { gte: start, lt: end }, status: "PAID" }, include: paymentInclude }),
    db.doctor.findMany({
      where: { active: true },
      select: { id: true, name: true, specialization: true, availability: true, availabilityDays: true, availabilityFrom: true, availabilityTo: true },
    }),
  ]);

  // Front-desk activity per hour of the day.
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, opd: 0, tests: 0, emergency: 0 }));
  for (const visit of visits) hourly[visit.createdAt.getHours()].opd += 1;
  for (const receipt of receipts) hourly[receipt.createdAt.getHours()].tests += 1;
  for (const visit of emergencies) hourly[visit.createdAt.getHours()].emergency += 1;

  // Doctors: everyone who saw a patient today, plus anyone scheduled for today who hasn't yet.
  const weekday = now.getDay();
  const doctorRows = new Map<number, { id: number; name: string; specialization: string; patients: number; free: number; lastToken: number; onDutyNow: boolean; scheduledToday: boolean }>();
  for (const doctor of doctors) {
    const days = parseAvailabilityDays(doctor.availabilityDays);
    const schedule = { availabilityDays: days, availabilityFrom: doctor.availabilityFrom, availabilityTo: doctor.availabilityTo, availability: doctor.availability };
    const scheduledToday = days.includes(weekday);
    doctorRows.set(doctor.id, {
      id: doctor.id,
      name: doctor.name,
      specialization: doctor.specialization,
      patients: 0,
      free: 0,
      lastToken: 0,
      // Without a weekly schedule the availability check falls back to "always available"; only
      // claim "on duty" for doctors who actually have one.
      onDutyNow: days.length > 0 && isDoctorAvailable(schedule, now),
      scheduledToday,
    });
  }
  let freeVisits = 0;
  let newPatientVisits = 0;
  for (const visit of visits) {
    const row = doctorRows.get(visit.doctorId) ?? { id: visit.doctorId, name: visit.doctor.name, specialization: "", patients: 0, free: 0, lastToken: 0, onDutyNow: false, scheduledToday: false };
    row.patients += 1;
    row.lastToken = Math.max(row.lastToken, visit.dailyToken);
    if (visit.payments[0]?.method === "FREE") {
      row.free += 1;
      freeVisits += 1;
    }
    if (visit.patient.createdAt >= start) newPatientVisits += 1;
    doctorRows.set(visit.doctorId, row);
  }
  const doctorList = [...doctorRows.values()]
    .filter((row) => row.patients > 0 || row.scheduledToday)
    .sort((a, b) => b.patients - a.patients || Number(b.onDutyNow) - Number(a.onDutyNow) || a.name.localeCompare(b.name))
    .map((row) => ({ id: row.id, name: row.name, specialization: row.specialization, patients: row.patients, free: row.free, lastToken: row.lastToken, onDutyNow: row.onDutyNow }));

  // Tests by module, and how many have their results back.
  const tests = TEST_MODULES.map((module) => ({ module, receipts: 0, items: 0, ready: 0, pending: 0, readyToPrint: 0 }));
  for (const receipt of receipts) {
    const row = tests.find((t) => t.module === receipt.module);
    if (!row) continue;
    const done = receipt.items.length > 0 && receipt.items.every((item) => isItemDone(item));
    row.receipts += 1;
    row.items += receipt.items.length;
    if (done) row.ready += 1;
    else row.pending += 1;
    if (done && !receipt.printedAt) row.readyToPrint += 1;
  }

  const otCount = (status: string) => otOpen.find((row) => row.status === status)?._count._all ?? 0;

  // Money the desk took today, by service and by method, and the part this user took.
  const deskPayments = payments.filter((payment) => DESK_SOURCES.includes(paymentSource(payment)));
  const byService = new Map<string, { amount: number; count: number }>();
  const byMethod = new Map<string, number>();
  let deskTotal = 0;
  let mine = 0;
  for (const payment of deskPayments) {
    const value = amount(payment.amount);
    const source = paymentSource(payment);
    deskTotal += value;
    if (payment.createdById === user.id) mine += value;
    const entry = byService.get(source) ?? { amount: 0, count: 0 };
    entry.amount += value;
    entry.count += 1;
    byService.set(source, entry);
    if (payment.method !== "FREE") byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + value);
  }

  // A short running log of the day, newest first.
  const activity = [
    ...visits.map((v) => ({ kind: "OPD", at: v.createdAt, patient: v.patient.name, mrNumber: v.patient.mrNumber, detail: `Token ${v.dailyToken} · ${v.doctor.name}` })),
    ...receipts.map((r) => ({ kind: "TEST", at: r.createdAt, patient: r.patient.name, mrNumber: r.patient.mrNumber, detail: `${serviceLabels[r.module] ?? r.module}: ${r.items.map((i) => i.nameAtSale).join(", ")}${r.admissionId ? " (in-patient)" : ""}` })),
    ...emergencies.map((e) => ({ kind: "EMERGENCY", at: e.createdAt, patient: e.patient.name, mrNumber: e.patient.mrNumber, detail: e.reason })),
    ...admittedToday.map((a) => ({ kind: "ADMISSION", at: a.admittedAt, patient: a.patient.name, mrNumber: a.patient.mrNumber, detail: `${a.admissionNumber} · ${a.roomLabel}` })),
    ...otNewToday.map((o) => ({ kind: "OT", at: o.createdAt, patient: o.patient.name, mrNumber: o.patient.mrNumber, detail: `${o.caseNumber}${o.procedureName ? ` · ${o.procedureName}` : ""}` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 12);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    user: { name: user.name || user.username },
    opd: { visits: visits.length, uniquePatients: new Set(visits.map((v) => v.patient.mrNumber)).size, freeVisits, newPatientVisits, newPatients },
    doctors: doctorList,
    hourly,
    tests,
    emergency: { visits: emergencies.length },
    admissions: { inHouse, awaitingDischarge, admittedToday: admittedToday.length, dischargedToday },
    ot: { booked: otCount("BOOKED"), inProgress: otCount("IN_PROGRESS"), readyForDischarge: otCount("READY_FOR_DISCHARGE"), newToday: otNewToday.length, dischargedToday: otDischargedToday },
    collection: {
      total: deskTotal,
      mine,
      payments: deskPayments.length,
      byService: [...byService.entries()].map(([key, value]) => ({ key, label: serviceLabels[key] ?? key, ...value })).sort((a, b) => b.amount - a.amount),
      byMethod: [...byMethod.entries()].map(([method, value]) => ({ method, amount: value })).sort((a, b) => b.amount - a.amount),
    },
    activity,
  });
}
