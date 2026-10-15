// Runs before `next dev` / `next start` (npm "predev" / "prestart"), after ensure-deps.
//
// Adds database structure that a newer version of the app needs, WITHOUT touching existing data.
// Every step first checks whether it is already there, so running it again changes nothing.
//
// Why this exists: on GoDaddy the database can only be loaded through "Import SQL", which replaces
// everything, so new tables/columns cannot be added that way once real patients are stored. The
// same steps are in prisma/migrations (used on a developer PC with `npx prisma migrate deploy`).
//
// It only runs on the hosting server (Linux), or anywhere when AUTO_DB_UPDATES=true. On a Windows or
// Mac developer machine it does nothing, so it never fights with `prisma migrate`.
// It never blocks start-up: if it cannot connect or a step fails it prints why and carries on.
const mariadb = require("mariadb");

const clean = (value, fallback = "") => String(value ?? fallback).trim().replace(/^["']|["']$/g, "");

const enabled = process.env.AUTO_DB_UPDATES === "true" || (process.env.AUTO_DB_UPDATES !== "false" && process.platform === "linux");
if (!enabled) process.exit(0);
if (!process.env.DB_NAME && !process.env.DATABASE_URL) process.exit(0);

const columnExists = async (conn, table, column) =>
  (await conn.query("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", [table, column])).length > 0;
const tableExists = async (conn, table) =>
  (await conn.query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", [table])).length > 0;
const constraintExists = async (conn, table, name) =>
  (await conn.query("SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?", [table, name])).length > 0;
const indexExists = async (conn, table, name) =>
  (await conn.query("SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?", [table, name])).length > 0;

// Foreign keys are added one by one; a database engine without foreign keys simply skips them.
async function addLinks(conn, links) {
  for (const [table, name, definition] of links) {
    if (await constraintExists(conn, table, name)) continue;
    try {
      await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` ${definition}`);
    } catch (error) {
      console.log(`[db-updates] link ${name} not added (${error.code ?? error.message}); the app works without it`);
    }
  }
}

// [table, column, definition] for every column the admissions module adds to existing tables.
const admissionColumns = [
  ["doctors", "admission_daily_fee", "DECIMAL(12, 2) NOT NULL DEFAULT 0"],
  ["doctors", "admission_split_type", "VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE'"],
  ["doctors", "admission_split_value", "DECIMAL(12, 2) NOT NULL DEFAULT 0"],
  ["payments", "admission_id", "INTEGER NULL"],
  ["room_beds", "category", "VARCHAR(20) NOT NULL DEFAULT 'WARD'"],
  ["room_beds", "unit_type", "VARCHAR(10) NOT NULL DEFAULT 'BED'"],
  ["ot_cases", "admission_id", "INTEGER NULL"],
  ["medicine_sales", "admission_id", "INTEGER NULL"],
  ["medicine_sales", "credit_status", "VARCHAR(12) NULL"],
  ["medicine_sales", "purpose", "VARCHAR(10) NULL"],
  ["medicine_sales", "settled_at", "DATETIME(3) NULL"],
  ["medicine_sales", "ot_case_id", "INTEGER NULL"],
  ["diagnostic_receipts", "admission_id", "INTEGER NULL"],
  ["medicine_sale_returns", "refund_mode", "VARCHAR(10) NOT NULL DEFAULT 'CASH'"],
];
const admissionTables = ["admissions", "admission_days", "admission_charges", "admission_category_fees"];
// Lab tests ordered for an admitted patient have no OPD visit, so opd_visit_id must allow NULL.
const opdVisitOptional = async (conn) =>
  (await conn.query("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'diagnostic_receipts' AND column_name = 'opd_visit_id' AND is_nullable = 'YES'")).length > 0;

// Same statements as prisma/migrations/20261003120000_lab_result_templates/migration.sql.
const updates = [
  {
    name: "lab result templates",
    needed: async (conn) => !(await tableExists(conn, "diagnostic_test_parameters")) || !(await tableExists(conn, "diagnostic_result_values")) || !(await columnExists(conn, "diagnostic_catalog_items", "default_remarks")) || !(await columnExists(conn, "diagnostic_receipt_items", "remarks")),
    run: async (conn) => {
      if (!(await columnExists(conn, "diagnostic_catalog_items", "default_remarks"))) await conn.query("ALTER TABLE `diagnostic_catalog_items` ADD COLUMN `default_remarks` VARCHAR(500) NULL");
      if (!(await columnExists(conn, "diagnostic_receipt_items", "remarks"))) await conn.query("ALTER TABLE `diagnostic_receipt_items` ADD COLUMN `remarks` VARCHAR(500) NULL");
      if (!(await tableExists(conn, "diagnostic_test_parameters"))) {
        await conn.query(`CREATE TABLE \`diagnostic_test_parameters\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`catalog_item_id\` INTEGER NOT NULL,
          \`sort_order\` INTEGER NOT NULL DEFAULT 0,
          \`kind\` VARCHAR(15) NOT NULL,
          \`name\` VARCHAR(200) NOT NULL,
          \`unit\` VARCHAR(30) NULL,
          \`alt_unit\` VARCHAR(30) NULL,
          \`alt_factor\` DECIMAL(14, 6) NULL,
          \`ref_low\` DECIMAL(14, 4) NULL,
          \`ref_high\` DECIMAL(14, 4) NULL,
          \`ref_text\` VARCHAR(200) NULL,
          INDEX \`diagnostic_test_parameters_catalog_item_id_sort_order_idx\`(\`catalog_item_id\`, \`sort_order\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      if (!(await tableExists(conn, "diagnostic_result_values"))) {
        await conn.query(`CREATE TABLE \`diagnostic_result_values\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`receipt_item_id\` INTEGER NOT NULL,
          \`parameter_id\` INTEGER NULL,
          \`sort_order\` INTEGER NOT NULL DEFAULT 0,
          \`kind\` VARCHAR(15) NOT NULL,
          \`name\` VARCHAR(200) NOT NULL,
          \`unit\` VARCHAR(30) NULL,
          \`alt_unit\` VARCHAR(30) NULL,
          \`alt_value\` VARCHAR(40) NULL,
          \`reference_text\` VARCHAR(200) NULL,
          \`value\` VARCHAR(300) NOT NULL,
          \`flag\` VARCHAR(10) NULL,
          INDEX \`diagnostic_result_values_receipt_item_id_sort_order_idx\`(\`receipt_item_id\`, \`sort_order\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      await addLinks(conn, [
        ["diagnostic_test_parameters", "diagnostic_test_parameters_catalog_item_id_fkey", "FOREIGN KEY (`catalog_item_id`) REFERENCES `diagnostic_catalog_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["diagnostic_result_values", "diagnostic_result_values_receipt_item_id_fkey", "FOREIGN KEY (`receipt_item_id`) REFERENCES `diagnostic_receipt_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["diagnostic_result_values", "diagnostic_result_values_parameter_id_fkey", "FOREIGN KEY (`parameter_id`) REFERENCES `diagnostic_test_parameters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
      ]);
    },
  },
  // Same statements as prisma/migrations/20261015120000_admissions/migration.sql.
  {
    name: "in-patient admissions",
    needed: async (conn) => {
      for (const table of admissionTables) if (!(await tableExists(conn, table))) return true;
      for (const [table, column] of admissionColumns) if (!(await columnExists(conn, table, column))) return true;
      return !(await opdVisitOptional(conn));
    },
    run: async (conn) => {
      for (const [table, column, definition] of admissionColumns) {
        if (!(await columnExists(conn, table, column))) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
      // Only allows NULL; the existing link to opd_visits and every existing value stay as they are.
      if (!(await opdVisitOptional(conn))) await conn.query("ALTER TABLE `diagnostic_receipts` MODIFY `opd_visit_id` INTEGER NULL");
      if (!(await tableExists(conn, "admissions"))) {
        await conn.query(`CREATE TABLE \`admissions\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`admission_number\` VARCHAR(40) NOT NULL,
          \`patient_id\` INTEGER NOT NULL,
          \`doctor_id\` INTEGER NOT NULL,
          \`category\` VARCHAR(20) NOT NULL,
          \`room_bed_id\` INTEGER NULL,
          \`room_label\` VARCHAR(150) NOT NULL,
          \`daily_room_rate\` DECIMAL(12, 2) NOT NULL,
          \`daily_doctor_fee\` DECIMAL(12, 2) NOT NULL,
          \`daily_technician_fee\` DECIMAL(12, 2) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'ADMITTED',
          \`admitted_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`invoiced_at\` DATETIME(3) NULL,
          \`discharged_at\` DATETIME(3) NULL,
          \`diagnosis\` VARCHAR(500) NULL,
          \`notes\` VARCHAR(1000) NULL,
          \`attendant_name\` VARCHAR(150) NULL,
          \`attendant_mobile\` VARCHAR(30) NULL,
          \`created_by_id\` INTEGER NOT NULL,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updated_at\` DATETIME(3) NOT NULL,
          UNIQUE INDEX \`admissions_admission_number_key\`(\`admission_number\`),
          INDEX \`admissions_status_idx\`(\`status\`),
          INDEX \`admissions_patient_id_idx\`(\`patient_id\`),
          INDEX \`admissions_room_bed_id_status_idx\`(\`room_bed_id\`, \`status\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      if (!(await tableExists(conn, "admission_days"))) {
        await conn.query(`CREATE TABLE \`admission_days\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`admission_id\` INTEGER NOT NULL,
          \`charge_date\` DATE NOT NULL,
          \`room_label\` VARCHAR(150) NOT NULL,
          \`room_rate\` DECIMAL(12, 2) NOT NULL,
          \`doctor_id\` INTEGER NOT NULL,
          \`doctor_fee\` DECIMAL(12, 2) NOT NULL,
          \`doctor_visited\` BOOLEAN NOT NULL DEFAULT true,
          \`technician_fee\` DECIMAL(12, 2) NOT NULL,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`admission_days_admission_id_charge_date_key\`(\`admission_id\`, \`charge_date\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      if (!(await tableExists(conn, "admission_charges"))) {
        await conn.query(`CREATE TABLE \`admission_charges\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`admission_id\` INTEGER NOT NULL,
          \`description\` VARCHAR(200) NOT NULL,
          \`amount\` DECIMAL(12, 2) NOT NULL,
          \`created_by_id\` INTEGER NOT NULL,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX \`admission_charges_admission_id_idx\`(\`admission_id\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      if (!(await tableExists(conn, "admission_category_fees"))) {
        await conn.query(`CREATE TABLE \`admission_category_fees\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT,
          \`category\` VARCHAR(20) NOT NULL,
          \`technician_fee\` DECIMAL(12, 2) NOT NULL DEFAULT 0,
          \`updated_at\` DATETIME(3) NOT NULL,
          UNIQUE INDEX \`admission_category_fees_category_key\`(\`category\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
      for (const [table, name, column] of [["payments", "payments_admission_id_idx", "admission_id"], ["ot_cases", "ot_cases_admission_id_idx", "admission_id"], ["medicine_sales", "medicine_sales_admission_id_idx", "admission_id"], ["medicine_sales", "medicine_sales_ot_case_id_idx", "ot_case_id"], ["diagnostic_receipts", "diagnostic_receipts_admission_id_idx", "admission_id"]]) {
        if (!(await indexExists(conn, table, name))) await conn.query(`CREATE INDEX \`${name}\` ON \`${table}\`(\`${column}\`)`);
      }
      await addLinks(conn, [
        ["payments", "payments_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
        ["ot_cases", "ot_cases_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
        ["admissions", "admissions_patient_id_fkey", "FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"],
        ["admissions", "admissions_doctor_id_fkey", "FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"],
        ["admissions", "admissions_room_bed_id_fkey", "FOREIGN KEY (`room_bed_id`) REFERENCES `room_beds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
        ["admissions", "admissions_created_by_id_fkey", "FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"],
        ["admission_days", "admission_days_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["admission_days", "admission_days_doctor_id_fkey", "FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"],
        ["admission_charges", "admission_charges_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["admission_charges", "admission_charges_created_by_id_fkey", "FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"],
        ["medicine_sales", "medicine_sales_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
        ["medicine_sales", "medicine_sales_ot_case_id_fkey", "FOREIGN KEY (`ot_case_id`) REFERENCES `ot_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
        ["diagnostic_receipts", "diagnostic_receipts_admission_id_fkey", "FOREIGN KEY (`admission_id`) REFERENCES `admissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
      ]);
    },
  },
];

async function connect(ssl) {
  return mariadb.createConnection({
    host: clean(process.env.DB_HOST, "localhost"),
    port: Number(clean(process.env.DB_PORT, "3306")),
    user: clean(process.env.DB_USER, "root"),
    password: clean(process.env.DB_PASSWORD),
    database: clean(process.env.DB_NAME, "clinicdb"),
    connectTimeout: 10000,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

(async () => {
  let conn;
  try {
    // Hosted databases usually insist on an encrypted connection; fall back to plain for a local one.
    const wantSsl = process.env.DB_SSL !== "off";
    try {
      conn = await connect(wantSsl);
    } catch (first) {
      if (!wantSsl) throw first;
      conn = await connect(false);
    }
    let applied = 0;
    for (const update of updates) {
      if (!(await update.needed(conn))) continue;
      console.log(`[db-updates] adding: ${update.name}`);
      await update.run(conn);
      applied += 1;
    }
    console.log(applied === 0 ? "[db-updates] database is up to date" : `[db-updates] done (${applied} update${applied === 1 ? "" : "s"} applied)`);
  } catch (error) {
    console.log(`[db-updates] skipped: ${error && (error.code || error.message) ? `${error.code ?? ""} ${String(error.message ?? "").split("\n")[0]}`.trim() : error}`);
  } finally {
    if (conn) await conn.end().catch(() => undefined);
  }
})();
