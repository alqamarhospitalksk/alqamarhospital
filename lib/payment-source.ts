// Every Payment row belongs to exactly one source (OPD visit, diagnostic receipt, OT case,
// emergency visit or medicine sale). The dashboard and the report export both need to say which,
// so the rule lives here once — before this, emergency and medicine-store payments were silently
// counted as "Operation theater".

export const serviceLabels: Record<string, string> = {
  OPD: "OPD consultation",
  LABORATORY: "Laboratory",
  ECO: "ECO",
  ECG: "ECG",
  "X-RAY": "X-Ray",
  ULTRASOUND: "Ultrasound",
  OT: "Operation theater",
  EMERGENCY: "Minor emergency",
  MEDICAL_STORE: "Medical store",
  // A payment whose visit/sale record no longer exists. Still real money, so it stays in the totals.
  OTHER: "Other / unlinked",
};

// Keys in display order, for building the "Income by service" breakdown.
export const serviceKeys = Object.keys(serviceLabels);

// Pass as `include` when loading payments that will be described by the helpers below.
export const paymentInclude = {
  opdVisit: { include: { patient: true, doctor: true } },
  receipt: { include: { patient: true, doctor: true } },
  otCase: { include: { patient: true, doctor: true } },
  emergencyVisit: { include: { patient: true } },
  medicineSale: { include: { patient: true } },
} as const;

type Party = { name: string; mrNumber: string } | null | undefined;
type PaymentLike = {
  opdVisit?: { patient?: Party; doctor?: { name: string } | null } | null;
  receipt?: { module: string; patient?: Party; doctor?: { name: string } | null } | null;
  otCase?: { patient?: Party; doctor?: { name: string } | null } | null;
  emergencyVisit?: { patient?: Party } | null;
  medicineSale?: { patient?: Party; customerName?: string | null } | null;
};

export function paymentSource(payment: PaymentLike): string {
  if (payment.opdVisit) return "OPD";
  if (payment.receipt) return payment.receipt.module;
  if (payment.otCase) return "OT";
  if (payment.emergencyVisit) return "EMERGENCY";
  if (payment.medicineSale) return "MEDICAL_STORE";
  return "OTHER";
}

// Patient (or walk-in customer) and doctor to show next to a payment.
export function describePaymentParty(payment: PaymentLike) {
  const patient = payment.opdVisit?.patient ?? payment.receipt?.patient ?? payment.otCase?.patient ?? payment.emergencyVisit?.patient ?? payment.medicineSale?.patient;
  const doctor = payment.opdVisit?.doctor ?? payment.receipt?.doctor ?? payment.otCase?.doctor;
  return {
    patientName: patient?.name ?? payment.medicineSale?.customerName ?? "Unknown patient",
    mrNumber: patient?.mrNumber ?? "",
    doctorName: doctor?.name ?? "",
  };
}
