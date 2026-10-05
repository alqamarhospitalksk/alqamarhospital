// Shared rules for template-based laboratory results (replaces the old PDF upload).
//
// A test's template is a list of DiagnosticTestParameter rows. When the Lab enters results, each
// filled-in row is copied ("snapshotted") into DiagnosticResultValue together with its name, units
// and reference range as they were at that moment, so editing a template later never rewrites
// reports that were already issued.

export const PARAMETER_KINDS = ["HEADING", "NUMERIC", "QUALITATIVE", "TEXT"] as const;
export type ParameterKind = (typeof PARAMETER_KINDS)[number];

export const QUALITATIVE_OPTIONS = ["NEGATIVE", "POSITIVE"] as const;

export const qualitativeLabel = (value: string) =>
  value === "NEGATIVE" ? "Negative (-Ve)" : value === "POSITIVE" ? "Positive (+Ve)" : value;

export type TemplateRow = {
  kind: string;
  refLow: { toString(): string } | null;
  refHigh: { toString(): string } | null;
  refText: string | null;
  unit: string | null;
  altFactor: { toString(): string } | null;
};

const num = (value: { toString(): string } | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
};

// What is printed in the "Reference Range" column: the typed text if there is one, otherwise
// built from the numeric low/high limits.
export function referenceText(row: TemplateRow): string | null {
  if (row.kind === "QUALITATIVE") return row.refText?.trim() || "Negative (-Ve)";
  if (row.refText?.trim()) return row.refText.trim();
  const low = num(row.refLow);
  const high = num(row.refHigh);
  const unit = row.unit ? ` ${row.unit}` : "";
  if (low !== null && high !== null) return `${low} - ${high}${unit}`;
  if (high !== null) return `<${high}${unit}`;
  if (low !== null) return `>${low}${unit}`;
  return null;
}

// HIGH / LOW for numbers outside the limits, ABNORMAL for a positive qualitative result,
// NORMAL otherwise. Returns null when nothing can be judged (text rows, no limits).
export function computeFlag(row: TemplateRow, value: string): "HIGH" | "LOW" | "ABNORMAL" | "NORMAL" | null {
  if (row.kind === "QUALITATIVE") return value === "POSITIVE" ? "ABNORMAL" : value === "NEGATIVE" ? "NORMAL" : null;
  if (row.kind !== "NUMERIC") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const low = num(row.refLow);
  const high = num(row.refHigh);
  if (low === null && high === null) return null;
  if (low !== null && parsed < low) return "LOW";
  if (high !== null && parsed > high) return "HIGH";
  return "NORMAL";
}

// Second-unit value, e.g. mg/dl x 0.0555 = mmol/l. Kept to 3 decimals like the old Access form.
export function alternateValue(row: TemplateRow, value: string): string | null {
  const factor = num(row.altFactor);
  const parsed = Number(value);
  if (row.kind !== "NUMERIC" || factor === null || !Number.isFinite(parsed)) return null;
  return String(Number((parsed * factor).toFixed(3)));
}

export type ResultValueLike = { kind: string; value: string };

// A test counts as done once it has a typed result or at least one real (non-heading) value.
export function isItemDone(item: { result: string | null; resultValues: ResultValueLike[] }) {
  return Boolean(item.result?.trim()) || item.resultValues.some((v) => v.kind !== "HEADING" && v.value.trim() !== "");
}

export type ParameterInput = {
  kind: ParameterKind;
  name: string;
  unit: string | null;
  altUnit: string | null;
  altFactor: number | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
};

const clean = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

// Validates the template rows sent by the catalog editor. Returns an error message or the rows.
export function parseParameters(raw: unknown): { error: string } | { rows: ParameterInput[] } {
  if (!Array.isArray(raw)) return { error: "Template rows must be a list." };
  if (raw.length > 100) return { error: "A template can have at most 100 rows." };
  const rows: ParameterInput[] = [];
  for (const entry of raw) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const kind = record.kind as ParameterKind;
    const name = clean(record.name, 200);
    if (!PARAMETER_KINDS.includes(kind) || !name) return { error: "Every template row needs a type and a name." };
    if (kind === "HEADING") {
      rows.push({ kind, name, unit: null, altUnit: null, altFactor: null, refLow: null, refHigh: null, refText: null });
      continue;
    }
    const altFactor = optionalNumber(record.altFactor);
    const refLow = optionalNumber(record.refLow);
    const refHigh = optionalNumber(record.refHigh);
    if ([altFactor, refLow, refHigh].some((n) => n !== null && Number.isNaN(n))) {
      return { error: `Row "${name}" has an invalid number.` };
    }
    if (refLow !== null && refHigh !== null && refLow > refHigh) {
      return { error: `Row "${name}": the low limit is above the high limit.` };
    }
    const numeric = kind === "NUMERIC";
    const altUnit = numeric ? clean(record.altUnit, 30) : null;
    rows.push({
      kind,
      name,
      unit: clean(record.unit, 30),
      altUnit,
      altFactor: altUnit ? altFactor : null,
      refLow: numeric ? refLow : null,
      refHigh: numeric ? refHigh : null,
      refText: clean(record.refText, 200),
    });
  }
  return { rows };
}
