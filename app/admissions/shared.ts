// Types and small helpers shared by the Admissions list and the admission profile page.

export type Bill = {
  days: number;
  roomTotal: number;
  doctorTotal: number;
  technicianTotal: number;
  extrasTotal: number;
  operationsTotal: number;
  testsTotal: number;
  hospitalTotal: number;
  hospitalPaid: number;
  hospitalBalance: number;
  storeTotal: number;
  storeOwed: number;
  storeByPurpose: Record<string, number>;
};

export type Lookups = {
  doctors: { id: number; name: string; specialization: string; admissionDailyFee: number }[];
  beds: {
    id: number;
    name: string;
    roomType: string;
    category: string;
    categoryLabel: string;
    unitType: string;
    dailyRate: number;
    occupiedBy: { admissionId: number; admissionNumber: string; patientName: string } | null;
  }[];
  technicianFees: Record<string, number>;
  categories: { value: string; label: string; roomCategories: string[] }[];
};

export const statusColors: Record<string, string> = { ADMITTED: "blue", INVOICED: "orange", DISCHARGED: "green", CANCELLED: "gray" };
export const statusLabels: Record<string, string> = { ADMITTED: "Admitted", INVOICED: "Invoiced", DISCHARGED: "Discharged", CANCELLED: "Cancelled" };
export const paymentMethodLabels: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank transfer", ONLINE: "Online" };

export const pkr = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

// Beds shown for a kind of admission: the allowed categories first, free beds before occupied ones.
export function bedsFor(lookups: Lookups | null, category: string) {
  const allowed = lookups?.categories.find((c) => c.value === category)?.roomCategories ?? [];
  return (lookups?.beds ?? []).filter((b) => allowed.includes(b.category)).sort((a, b) => Number(Boolean(a.occupiedBy)) - Number(Boolean(b.occupiedBy)) || a.name.localeCompare(b.name));
}

export function bedLabel(bed: Lookups["beds"][number]) {
  const basis = bed.unitType === "ROOM" ? "per room" : "per bed";
  return `${bed.name} · ${bed.categoryLabel} · ${pkr(bed.dailyRate)}/day ${basis}${bed.occupiedBy ? ` — occupied (${bed.occupiedBy.admissionNumber})` : ""}`;
}
