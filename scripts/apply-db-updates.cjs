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
      // Links between the tables (skipped on a database engine that has no foreign keys).
      const links = [
        ["diagnostic_test_parameters", "diagnostic_test_parameters_catalog_item_id_fkey", "FOREIGN KEY (`catalog_item_id`) REFERENCES `diagnostic_catalog_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["diagnostic_result_values", "diagnostic_result_values_receipt_item_id_fkey", "FOREIGN KEY (`receipt_item_id`) REFERENCES `diagnostic_receipt_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
        ["diagnostic_result_values", "diagnostic_result_values_parameter_id_fkey", "FOREIGN KEY (`parameter_id`) REFERENCES `diagnostic_test_parameters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE"],
      ];
      for (const [table, name, definition] of links) {
        if (await constraintExists(conn, table, name)) continue;
        try {
          await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` ${definition}`);
        } catch (error) {
          console.log(`[db-updates] link ${name} not added (${error.code ?? error.message}); the app works without it`);
        }
      }
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
