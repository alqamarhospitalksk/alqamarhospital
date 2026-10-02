// Prints the SQL that creates the first Management (admin) login on a brand-new database.
//
//   node deploy/create-admin.mjs <username> <password> ["Full Name"]
//
// Paste the printed SQL into phpMyAdmin (SQL tab) after importing deploy/schema.sql.
// The password is hashed here with the same scrypt method the app uses, so it is never stored
// in plain text. The new user is forced to choose their own password at first sign-in.
import { randomBytes, scryptSync } from "node:crypto";

const [username, password, name = "Administrator"] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: node deploy/create-admin.mjs <username> <password> ["Full Name"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
// Quote a value for SQL: double any single quote and any backslash.
const q = (value) => `'${String(value).split("\\").join("\\\\").split("'").join("''")}'`;

console.log(`INSERT INTO \`users\` (\`name\`, \`username\`, \`password_hash\`, \`role\`, \`active\`, \`must_change_password\`, \`created_at\`, \`updated_at\`)
VALUES (${q(name)}, ${q(username.trim().toLowerCase())}, ${q(hash)}, 'MANAGEMENT', 1, 1, NOW(3), NOW(3));`);
