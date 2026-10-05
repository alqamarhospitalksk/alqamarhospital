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

  // =====================================================================================
  // Forms taken from the clinic's old Access database (Laboratory.accdb) that the list above did
  // not have. The result lines, their order and the wording follow the old Access forms. Units and
  // normal ranges are copied from what the lab typed into those forms where the file holds them
  // (cardiac enzymes, bilirubin, amylase, platelets, bleeding/clotting time, acid phosphatase,
  // phosphate, semen count). Where the Access file holds no range, none is filled in here on
  // purpose: add the range your lab prints, then save. Nothing is written to the database until
  // the Lab picks a template and saves a test.
  // =====================================================================================

  // ---- Chemistry (from Access) ----
  {
    name: "Serum Amylase",
    category: "Chemistry",
    rows: [num("Serum Amylase", "u/l", 27, 220, "27 - 220 u/l")],
  },
  {
    name: "Cardiac Enzymes (CPK, SGOT, LDH)",
    category: "Chemistry",
    rows: [
      num("CPK", "u/l", 25, 195, "25 - 195 u/l"),
      num("SGOT (AST)", "u/l", 0, 40, "0 - 40 u/l"),
      num("LDH", "u/l", 200, 485, "200 - 485 u/l"),
    ],
  },
  {
    name: "Serum Bilirubin (Total, Direct, Indirect)",
    category: "Chemistry",
    rows: [
      num("Total Bilirubin", "mg%", undefined, 1.0, "upto 1.0 mg%"),
      num("Direct Bilirubin", "mg%", undefined, 0.25, "upto 0.25 mg%"),
      num("Indirect Bilirubin", "mg%", undefined, 0.8, "upto 0.8 mg%"),
    ],
  },
  {
    name: "Calcium Profile (Calcium, ALP, Phosphate, SGPT)",
    category: "Chemistry",
    rows: [
      num("Serum Calcium", "mg/dl", undefined, undefined),
      num("Alkaline Phosphatase", "u/l", undefined, undefined),
      num("Serum Phosphate", "mg/dl", undefined, undefined, "Children: 4.0 - 7.0 / Adults: 2.5 - 5.0"),
      num("SGPT (ALT)", "u/l", undefined, undefined),
    ],
  },
  {
    name: "Acid Phosphatase Profile",
    category: "Chemistry",
    rows: [
      num("Serum Calcium", "mg/dl", 8, 10, "8 - 10 mg/dl"),
      num("Acid Phosphatase", "u/l", undefined, 6.5, "Up to 6.5 u/l"),
      num("Serum Phosphate", "mg/dl", undefined, undefined, "Children: 4.0 - 7.0 / Adults: 2.5 - 5.0"),
    ],
  },

  // ---- Haematology (from Access) ----
  {
    name: "Platelet Count",
    category: "Haematology",
    rows: [num("Platelets Count", "/cmm", 150000, 400000, "150,000 - 400,000 /cmm")],
  },
  {
    name: "Platelet Count with BT / CT",
    category: "Haematology",
    rows: [
      num("Platelets Count", "/cmm", 150000, 400000, "1,50,000 to 4,00,000 /cmm"),
      text("Bleeding Time", "2 - 7 Min"),
      text("Clotting Time", "5 - 11 Min"),
    ],
  },
  {
    name: "Peripheral Blood Smear",
    category: "Haematology",
    rows: [
      num("Hemoglobin", "g/dl", undefined, undefined),
      num("Total Leucocyte Count (TLC)", "/cmm", undefined, undefined),
      num("Platelet Count", "/cmm", undefined, undefined),
      num("Neutrophils", "%", undefined, undefined),
      num("Lymphocytes", "%", undefined, undefined),
      num("Monocytes", "%", undefined, undefined),
      num("Eosinophils", "%", undefined, undefined),
      num("Basophils", "%", undefined, undefined),
      num("ESR", "mm/1st hr", undefined, undefined),
      text("RBC Morphology"),
      text("Malarial Parasite (MP)"),
    ],
  },
  { name: "FDPs (Fibrin Degradation Products)", category: "Haematology", rows: [text("FDPs")] },
  {
    name: "Cross Match (X-Match)",
    category: "Haematology",
    rows: [
      text("Patient Blood Group"),
      text("Donor Name"),
      text("Donor Blood Group"),
      text("Saline Phase"),
      text("Albumin Phase"),
      text("Coomb's Phase"),
      text("Bag No"),
    ],
  },
  { name: "Anti-Rh Antibody Titre", category: "Haematology", rows: [text("Rh Antibodies Titre")] },
  { name: "Coombs Test", category: "Haematology", rows: [text("Rh Antibody Titre"), text("Coomb's Test")] },

  // ---- Hormones & Vitamins (from Access) ----
  { name: "Beta HCG (B-HCG)", category: "Hormones & Vitamins", rows: [num("B-HCG", "mIU/ml", undefined, undefined)] },
  { name: "FSH", category: "Hormones & Vitamins", rows: [num("FSH", "mIU/ml", undefined, undefined)] },
  {
    name: "LH / FSH / Progesterone",
    category: "Hormones & Vitamins",
    rows: [
      num("LH", "mIU/ml", undefined, undefined),
      num("FSH", "mIU/ml", undefined, undefined),
      num("Progesterone", "ng/ml", undefined, undefined),
    ],
  },
  { name: "Progesterone", category: "Hormones & Vitamins", rows: [num("Progesterone", "ng/ml", undefined, undefined)] },
  { name: "Testosterone", category: "Hormones & Vitamins", rows: [num("Testosterone", "ng/ml", undefined, undefined)] },
  { name: "Estradiol (E2)", category: "Hormones & Vitamins", rows: [num("Estradiol (E2)", "pg/ml", undefined, undefined)] },

  // ---- Serology (from Access) ----
  { name: "ANF (Anti-Nuclear Factor)", category: "Serology", rows: [qual("Anti Nuclear Factor (ANF)")] },
  { name: "ASO Titre", category: "Serology", rows: [text("ASO Titre")] },
  { name: "RA Factor", category: "Serology", rows: [qual("RA Factor")] },
  { name: "VDRL", category: "Serology", rows: [qual("VDRL")] },
  { name: "ICT", category: "Serology", rows: [qual("ICT")] },
  {
    name: "Brucella Titre",
    category: "Serology",
    rows: [text("Brucella Abortus"), text("Brucella Melitensis")],
  },
  {
    name: "TORCH Profile",
    category: "Serology",
    rows: [
      text("Toxoplasma IgG"),
      text("Toxoplasma IgM"),
      text("Rubella IgG"),
      text("Rubella IgM"),
      text("CMV IgG"),
      text("CMV IgM"),
    ],
  },
  {
    name: "Toxoplasma IgG / IgM",
    category: "Serology",
    rows: [text("Toxoplasma IgG"), text("Toxoplasma IgM")],
  },
  {
    name: "HBsAg / HCV by ELISA",
    category: "Serology",
    rows: [
      text("HBs Ag"),
      text("HBs Ag Patient Value"),
      text("HBs Ag Cut-off Value"),
      text("HCV Antibodies"),
      text("HCV Antibodies Patient Value"),
      text("HCV Antibodies Cut-off Value"),
    ],
  },
  { name: "Echinococcus Haemagglutination", category: "Serology", rows: [text("Echinococcus Haemagglutination")] },

  // ---- Urine & Stool (from Access) ----
  { name: "Urine for Ketone Bodies", category: "Urine & Stool", rows: [text("Urine for Ketone Bodies", "Nil")] },
  { name: "Urine Albumin", category: "Urine & Stool", rows: [text("Urine Albumin", "Nil")] },
  { name: "Urine for Sugar", category: "Urine & Stool", rows: [text("Urine for Sugar", "Nil")] },
  {
    name: "Urine for Sugar & Albumin",
    category: "Urine & Stool",
    rows: [text("Urine for Sugar", "Nil"), text("Urine for Albumin", "Nil")],
  },

  // ---- Microbiology & Pathology (from Access) ----
  { name: "AFB (Sputum)", category: "Microbiology & Pathology", rows: [qual("Sputum for AFB")] },
  { name: "Urine Culture & Sensitivity", category: "Microbiology & Pathology", rows: [text("Result")] },
  { name: "HVS Culture & Sensitivity", category: "Microbiology & Pathology", rows: [text("Result")] },
  {
    name: "Semen Analysis",
    category: "Microbiology & Pathology",
    rows: [
      num("Volume", "ml", undefined, undefined),
      text("Colour"),
      text("Consistency"),
      head("Morphology"),
      num("Normal Forms", "%", undefined, undefined),
      num("Abnormal Forms", "%", undefined, undefined),
      head("Motility"),
      num("Active", "%", undefined, undefined),
      num("Sluggish", "%", undefined, undefined),
      num("Dead", "%", undefined, undefined),
      head("Count"),
      num("Total Sperm Count", "Million/ml", 60, 200, "60.0 - 200.0 Million/ml"),
      text("Pus Cells", "/HPF"),
      text("RBCs", "/HPF"),
    ],
  },
  {
    name: "Pap Smear (Cytology)",
    category: "Microbiology & Pathology",
    rows: [text("Microscopic Examination (1)"), text("Microscopic Examination (2)")],
  },
  {
    name: "Biopsy (Histopathology)",
    category: "Microbiology & Pathology",
    rows: [text("Specimen"), text("Gross Examination"), text("Microscopic Examination"), text("Opinion")],
  },
];

export const LAB_TEMPLATE_CATEGORIES = [...new Set(LAB_TEMPLATE_LIBRARY.map((t) => t.category))];
