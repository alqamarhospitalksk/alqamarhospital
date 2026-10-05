// Ready-made result templates for common laboratory tests, offered in the catalog editor so a
// test never has to be built row by row. Picking one only fills the editor: the Lab can still
// change any row before saving, and nothing here is written to the database by itself.
//
// Reference ranges are typical adult values. Ranges differ between labs, analysers and kits, so
// the Lab should check them against its own before relying on them.

export type LibraryRow = {
  kind: "HEADING" | "NUMERIC" | "QUALITATIVE" | "TEXT";
  name: string;
  unit?: string;
  altUnit?: string;
  altFactor?: number;
  refLow?: number;
  refHigh?: number;
  refText?: string;
};

export type LibraryTemplate = {
  name: string;
  category: string;
  remarks?: string;
  rows: LibraryRow[];
};

const head = (name: string): LibraryRow => ({ kind: "HEADING", name });
const text = (name: string, refText?: string): LibraryRow => ({ kind: "TEXT", name, refText });
const qual = (name: string, refText?: string): LibraryRow => ({ kind: "QUALITATIVE", name, refText });
// refText overrides what is printed; low/high still drive the automatic High/Low flag.
const num = (name: string, unit: string, refLow: number | undefined, refHigh: number | undefined, refText?: string, alt?: [string, number]): LibraryRow => ({
  kind: "NUMERIC",
  name,
  unit,
  refLow,
  refHigh,
  refText,
  ...(alt ? { altUnit: alt[0], altFactor: alt[1] } : {}),
});

const glucoseAlt: [string, number] = ["mmol", 0.0555];
const gttGlucose = (high: number, mmol: string) => num("Blood Glucose", "mg/dl", undefined, high, `<${high} mg/dl or <${mmol} mmol/l`, glucoseAlt);
const gttRows: LibraryRow[] = [
  head("Fasting"),
  num("Fasting Blood Glucose", "mg/dl", undefined, 115, "<115 mg/dl or <6.4 mmol/l", glucoseAlt),
  text("Fasting Urine Sugar"),
  head("After 30 Minutes. 75gm Glucose Orally Given"),
  gttGlucose(200, "11.1"),
  text("Urine Sugar"),
  head("After 1 Hour. 75gm Glucose Orally Given"),
  gttGlucose(200, "11.1"),
  text("Urine Sugar"),
  head("After 1.5 Hour. 75gm Glucose Orally Given"),
  gttGlucose(200, "11.1"),
  text("Urine Sugar"),
  head("After 2 Hours. 75gm Glucose Orally Given"),
  gttGlucose(140, "7.8"),
  text("Urine Sugar"),
];

export const LAB_TEMPLATE_LIBRARY: LibraryTemplate[] = [
  // ---- Haematology ----
  {
    name: "CBC (Complete Blood Count)",
    category: "Haematology",
    rows: [
      num("Hemoglobin", "g/dl", 12, 17, "M: 13 - 17 / F: 12 - 15"),
      num("Total RBC Count", "million/cmm", 3.8, 6.0, "M: 4.5 - 6.0 / F: 3.8 - 5.2"),
      num("PCV / Hematocrit", "%", 36, 52, "M: 40 - 52 / F: 36 - 47"),
      num("MCV", "fl", 80, 100),
      num("MCH", "pg", 27, 33),
      num("MCHC", "g/dl", 32, 36),
      num("RDW", "%", 11.5, 14.5),
      num("Total WBC Count", "/cmm", 4000, 11000),
      head("Differential Count"),
      num("Neutrophils", "%", 40, 75),
      num("Lymphocytes", "%", 20, 45),
      num("Monocytes", "%", 2, 10),
      num("Eosinophils", "%", 1, 6),
      num("Basophils", "%", 0, 1),
      num("Platelet Count", "/cmm", 150000, 450000),
    ],
  },
  { name: "Hemoglobin (Hb)", category: "Haematology", rows: [num("Hemoglobin", "g/dl", 12, 17, "M: 13 - 17 / F: 12 - 15")] },
  { name: "ESR", category: "Haematology", rows: [num("ESR (1st hour)", "mm/hr", 0, 20, "M: 0 - 15 / F: 0 - 20")] },
  {
    name: "BT / CT",
    category: "Haematology",
    rows: [num("Bleeding Time (BT)", "min", 1, 7, "1 - 7 min"), num("Clotting Time (CT)", "min", 4, 10, "4 - 10 min")],
  },
  {
    name: "PT / INR",
    category: "Haematology",
    rows: [text("Control", undefined), num("Prothrombin Time (PT)", "sec", 11, 14, "11 - 14 sec"), num("INR", "", 0.8, 1.2, "0.8 - 1.2")],
  },
  {
    name: "Blood Group & Rh",
    category: "Haematology",
    rows: [text("Blood Group", "A / B / AB / O"), text("Rh Factor", "Positive / Negative")],
  },

  // ---- Chemistry ----
  {
    name: "Blood Glucose Fasting",
    category: "Chemistry",
    rows: [num("Blood Glucose (Fasting)", "mg/dl", 70, 110, "70 - 110 mg/dl", glucoseAlt)],
  },
  {
    name: "Blood Glucose Random",
    category: "Chemistry",
    rows: [num("Blood Glucose (Random)", "mg/dl", 70, 140, "Up to 140 mg/dl", glucoseAlt)],
  },
  { name: "GTT Male", category: "Chemistry", rows: gttRows },
  { name: "GTT Female", category: "Chemistry", rows: gttRows },
  {
    name: "HbA1c",
    category: "Chemistry",
    rows: [num("HbA1c", "%", 4, 5.6, "Normal: <5.7 / Pre-diabetes: 5.7 - 6.4 / Diabetes: >=6.5")],
  },
  {
    name: "Lipid Profile",
    category: "Chemistry",
    rows: [
      num("Total Cholesterol", "mg/dl", undefined, 200, "<200 mg/dl"),
      num("Triglycerides", "mg/dl", undefined, 150, "<150 mg/dl"),
      num("HDL Cholesterol", "mg/dl", 40, undefined, ">40 mg/dl"),
      num("LDL Cholesterol", "mg/dl", undefined, 130, "<130 mg/dl"),
      num("VLDL Cholesterol", "mg/dl", 5, 40, "5 - 40 mg/dl"),
      num("Cholesterol / HDL Ratio", "", undefined, 5, "<5.0"),
    ],
  },
  {
    name: "LFT (Liver Function Tests)",
    category: "Chemistry",
    rows: [
      num("Total Bilirubin", "mg/dl", 0.2, 1.2, "0.2 - 1.2 mg/dl"),
      num("Direct Bilirubin", "mg/dl", 0, 0.3, "0 - 0.3 mg/dl"),
      num("Indirect Bilirubin", "mg/dl", 0.1, 1.0, "0.1 - 1.0 mg/dl"),
      num("ALT (SGPT)", "U/L", 0, 40, "Up to 40 U/L"),
      num("AST (SGOT)", "U/L", 0, 40, "Up to 40 U/L"),
      num("Alkaline Phosphatase (ALP)", "U/L", 44, 147, "44 - 147 U/L"),
      num("Total Protein", "g/dl", 6.0, 8.3, "6.0 - 8.3 g/dl"),
      num("Albumin", "g/dl", 3.5, 5.0, "3.5 - 5.0 g/dl"),
      num("Globulin", "g/dl", 2.0, 3.5, "2.0 - 3.5 g/dl"),
    ],
  },
  {
    name: "RFT (Renal Function Tests)",
    category: "Chemistry",
    rows: [
      num("Blood Urea", "mg/dl", 15, 45, "15 - 45 mg/dl"),
      num("Serum Creatinine", "mg/dl", 0.6, 1.3, "M: 0.7 - 1.3 / F: 0.6 - 1.1"),
      num("Serum Uric Acid", "mg/dl", 2.6, 7.2, "M: 3.5 - 7.2 / F: 2.6 - 6.0"),
      num("Sodium (Na)", "mmol/l", 135, 145, "135 - 145 mmol/l"),
      num("Potassium (K)", "mmol/l", 3.5, 5.1, "3.5 - 5.1 mmol/l"),
      num("Chloride (Cl)", "mmol/l", 98, 107, "98 - 107 mmol/l"),
    ],
  },
  {
    name: "Serum Electrolytes",
    category: "Chemistry",
    rows: [
      num("Sodium (Na)", "mmol/l", 135, 145, "135 - 145 mmol/l"),
      num("Potassium (K)", "mmol/l", 3.5, 5.1, "3.5 - 5.1 mmol/l"),
      num("Chloride (Cl)", "mmol/l", 98, 107, "98 - 107 mmol/l"),
    ],
  },
  { name: "Serum Creatinine", category: "Chemistry", rows: [num("Serum Creatinine", "mg/dl", 0.6, 1.3, "M: 0.7 - 1.3 / F: 0.6 - 1.1")] },
  { name: "Blood Urea", category: "Chemistry", rows: [num("Blood Urea", "mg/dl", 15, 45, "15 - 45 mg/dl")] },
  { name: "Serum Uric Acid", category: "Chemistry", rows: [num("Serum Uric Acid", "mg/dl", 2.6, 7.2, "M: 3.5 - 7.2 / F: 2.6 - 6.0")] },
  { name: "Serum Calcium", category: "Chemistry", rows: [num("Serum Calcium", "mg/dl", 8.5, 10.5, "8.5 - 10.5 mg/dl")] },
  { name: "CRP (C-Reactive Protein)", category: "Chemistry", rows: [num("CRP", "mg/l", undefined, 6, "<6 mg/l")] },

  // ---- Hormones & vitamins ----
  {
    name: "Thyroid Profile",
    category: "Hormones & Vitamins",
    rows: [
      num("TSH", "uIU/ml", 0.4, 4.0, "0.4 - 4.0 uIU/ml"),
      num("T3 (Total)", "ng/dl", 80, 200, "80 - 200 ng/dl"),
      num("T4 (Total)", "ug/dl", 5.1, 14.1, "5.1 - 14.1 ug/dl"),
    ],
  },
  { name: "TSH", category: "Hormones & Vitamins", rows: [num("TSH", "uIU/ml", 0.4, 4.0, "0.4 - 4.0 uIU/ml")] },
  { name: "Vitamin D (25-OH)", category: "Hormones & Vitamins", rows: [num("25-OH Vitamin D", "ng/ml", 30, 100, "Sufficient: 30 - 100 ng/ml")] },
  { name: "Vitamin B12", category: "Hormones & Vitamins", rows: [num("Vitamin B12", "pg/ml", 200, 900, "200 - 900 pg/ml")] },
  {
    name: "Serum Ferritin",
    category: "Hormones & Vitamins",
    rows: [num("Serum Ferritin", "ng/ml", 11, 336, "M: 24 - 336 / F: 11 - 307 ng/ml")],
  },

  // ---- Serology / immunology ----
  {
    name: "HBS/HCV",
    category: "Serology",
    remarks: "Test Performed By Chromatography Method",
    rows: [qual("HBs Ag Test"), qual("HCV Anti Test"), qual("HIV")],
  },
  { name: "HBsAg", category: "Serology", remarks: "Test Performed By Chromatography Method", rows: [qual("HBs Ag Test")] },
  { name: "Anti-HCV", category: "Serology", remarks: "Test Performed By Chromatography Method", rows: [qual("HCV Anti Test")] },
  { name: "HIV Screening", category: "Serology", remarks: "Test Performed By Chromatography Method", rows: [qual("HIV")] },
  {
    name: "Widal Test",
    category: "Serology",
    rows: [text("Salmonella Typhi O", "<1:80"), text("Salmonella Typhi H", "<1:80"), text("Salmonella Paratyphi AH", "<1:80"), text("Salmonella Paratyphi BH", "<1:80")],
  },
  { name: "Typhidot (IgM / IgG)", category: "Serology", rows: [qual("Typhidot IgM"), qual("Typhidot IgG")] },
  { name: "Dengue NS1 / IgM / IgG", category: "Serology", rows: [qual("Dengue NS1 Antigen"), qual("Dengue IgM"), qual("Dengue IgG")] },
  {
    name: "Malaria Parasite (MP)",
    category: "Serology",
    rows: [qual("Malaria Parasite (MP)"), text("Species", "Plasmodium vivax / falciparum")],
  },
  { name: "H. Pylori Antigen (Stool)", category: "Serology", rows: [qual("H. Pylori Antigen")] },
  { name: "Pregnancy Test (Urine)", category: "Serology", rows: [qual("Urine Pregnancy Test (hCG)")] },

  // ---- Urine & stool ----
  {
    name: "Urine R/E (Complete Urine Examination)",
    category: "Urine & Stool",
    rows: [
      head("Physical Examination"),
      text("Colour", "Pale yellow"),
      text("Appearance", "Clear"),
      num("Specific Gravity", "", 1.005, 1.03, "1.005 - 1.030"),
      num("pH", "", 4.6, 8.0, "4.6 - 8.0"),
      head("Chemical Examination"),
      text("Protein (Albumin)", "Nil"),
      text("Glucose (Sugar)", "Nil"),
      text("Ketones", "Nil"),
      text("Bilirubin", "Nil"),
      text("Urobilinogen", "Normal"),
      text("Blood", "Nil"),
      head("Microscopic Examination"),
      num("Pus Cells", "/HPF", 0, 5, "0 - 5 /HPF"),
      num("Red Blood Cells", "/HPF", 0, 2, "0 - 2 /HPF"),
      text("Epithelial Cells", "Occasional"),
      text("Casts", "Nil"),
      text("Crystals", "Nil"),
      text("Bacteria", "Nil"),
    ],
  },
  {
    name: "Stool R/E (Complete Stool Examination)",
    category: "Urine & Stool",
    rows: [
      head("Physical Examination"),
      text("Colour", "Brown"),
      text("Consistency", "Formed"),
      text("Mucus", "Nil"),
      text("Blood", "Nil"),
      head("Microscopic Examination"),
      num("Pus Cells", "/HPF", 0, 5, "0 - 5 /HPF"),
      num("Red Blood Cells", "/HPF", 0, 2, "0 - 2 /HPF"),
      text("Ova", "Nil"),
      text("Cysts", "Nil"),
      text("Parasites", "Nil"),
    ],
  },
];

export const LAB_TEMPLATE_CATEGORIES = [...new Set(LAB_TEMPLATE_LIBRARY.map((t) => t.category))];
