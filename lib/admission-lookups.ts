import { db } from "./db";
import { ACTIVE_STATUSES, ADMISSION_CATEGORIES, admissionCategoryLabels, allowedRoomCategories, roomCategoryLabels } from "./admission";

// What the admit and change-room forms need: doctors with their admission fee, every bed with who
// is in it, and the default technician fee per admission category. Kept out of lib/admission.ts,
// which the browser pages import for its labels and so must not pull in the database client.
export async function admissionLookups() {
  const [doctors, beds, fees, occupied] = await Promise.all([
    db.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, specialization: true, admissionDailyFee: true } }),
    db.roomBed.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.admissionCategoryFee.findMany(),
    db.admission.findMany({ where: { status: { in: ACTIVE_STATUSES }, roomBedId: { not: null } }, select: { id: true, roomBedId: true, admissionNumber: true, patient: { select: { name: true } } } }),
  ]);
  const occupiedBy = new Map(occupied.map((a) => [a.roomBedId, { admissionId: a.id, admissionNumber: a.admissionNumber, patientName: a.patient.name }]));
  return {
    doctors: doctors.map((d) => ({ id: d.id, name: d.name, specialization: d.specialization, admissionDailyFee: Number(d.admissionDailyFee) })),
    beds: beds.map((b) => ({
      id: b.id,
      name: b.name,
      roomType: b.roomType,
      category: b.category,
      categoryLabel: roomCategoryLabels[b.category] ?? b.category,
      unitType: b.unitType,
      dailyRate: Number(b.dailyRate),
      occupiedBy: occupiedBy.get(b.id) ?? null,
    })),
    technicianFees: Object.fromEntries(ADMISSION_CATEGORIES.map((c) => [c, Number(fees.find((f) => f.category === c)?.technicianFee ?? 0)])),
    categories: ADMISSION_CATEGORIES.map((c) => ({ value: c, label: admissionCategoryLabels[c], roomCategories: allowedRoomCategories[c] })),
  };
}
