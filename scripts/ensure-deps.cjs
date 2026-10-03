// Runs before `next dev` / `next start` (npm "predev" / "prestart").
//
// Why this exists: on the hosting platform the app's node_modules can come up incomplete
// (whole packages missing, files such as index.d.ts missing, or the native binaries for the
// server's CPU missing). The app then fails with "Cannot find module ..." or Next.js tries to
// install packages itself, which fails because the platform's default npm cache is read-only.
//
// This checks EVERY package that package-lock.json says is needed at runtime (and the native
// binaries that match this server), repairs whatever is broken using a cache folder the app may
// write to, and does nothing when everything is in place.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const lockFile = path.join(root, "package-lock.json");

function isMusl() {
  if (process.platform !== "linux") return false;
  try {
    return !process.report.getReport().header.glibcVersionRuntime;
  } catch {
    return false;
  }
}

// Does an optional (native) package apply to this machine? Uses the os / cpu / libc lists in the lockfile.
function appliesHere(entry) {
  const allows = (list, value) => {
    if (!Array.isArray(list) || list.length === 0) return true;
    const denied = list.filter((x) => x.startsWith("!")).map((x) => x.slice(1));
    if (denied.includes(value)) return false;
    const allowed = list.filter((x) => !x.startsWith("!"));
    return allowed.length === 0 || allowed.includes(value);
  };
  return allows(entry.os, process.platform) && allows(entry.cpu, process.arch) && allows(entry.libc, isMusl() ? "musl" : "glibc");
}

// Is the package folder there and complete enough to load?
function problemWith(dir, entry) {
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) return "missing";
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch {
    return "unreadable package.json";
  }
  if (typeof pkg.main === "string" && pkg.main && !entry.link) {
    const main = path.join(dir, pkg.main);
    const found = [main, `${main}.js`, `${main}.cjs`, `${main}.json`, `${main}.node`, path.join(main, "index.js")].some((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (!found) return `main file ${pkg.main} missing`;
  }
  return null;
}

function findProblems() {
  const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  const problems = [];
  const skippedParents = [];
  let checked = 0;
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    if (!key || entry.link) continue; // "" is the project itself
    // Dev tools are not needed to run; native packages for other platforms are not installed here;
    // and anything nested inside a skipped package (e.g. a WebAssembly build's own helpers) is skipped too.
    if (skippedParents.some((parent) => key.startsWith(parent + "/"))) continue;
    if (entry.dev || (entry.optional && !appliesHere(entry))) {
      skippedParents.push(key);
      continue;
    }
    checked += 1;
    const problem = problemWith(path.join(root, key), entry);
    if (problem) problems.push({ key, problem });
  }
  return { problems, checked };
}

function npm(args) {
  const cache = path.join(os.tmpdir(), "careledger-npm-cache");
  return spawnSync("npm", [...args, "--no-audit", "--no-fund", "--prefer-offline", "--cache", cache], {
    cwd: root,
    stdio: "inherit",
    shell: true, // needed on Windows, where npm is a .cmd file
    env: { ...process.env, NODE_ENV: "development", npm_config_cache: cache },
  }).status;
}

// The database client is generated code (npx prisma generate), not a downloadable package. A fresh or
// repaired node_modules does not have it until someone generates it, and without it every page that
// touches the database fails with "Cannot find module '.prisma/client/default'". The build step
// generates it, but the preview server (next dev) does not, so it is checked here.
function ensurePrismaClient() {
  const generated = path.join(root, "node_modules", ".prisma", "client", "default.js");
  if (fs.existsSync(generated)) return;
  console.log("[ensure-deps] database client not generated - running prisma generate");
  const cache = path.join(os.tmpdir(), "careledger-npm-cache");
  const status = spawnSync("npx", ["prisma", "generate"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, npm_config_cache: cache },
  }).status;
  console.log(fs.existsSync(generated) ? "[ensure-deps] database client generated" : `[ensure-deps] prisma generate did not complete (exit ${status})`);
}

try {
  if (!fs.existsSync(lockFile)) process.exit(0);
  let { problems, checked } = findProblems();
  if (problems.length === 0) {
    console.log(`[ensure-deps] ok (${checked} packages checked)`);
    ensurePrismaClient();
    process.exit(0);
  }

  const names = problems.map((p) => p.key.replace(/^node_modules\//, ""));
  console.log(`[ensure-deps] ${problems.length} package(s) need repair: ${names.slice(0, 25).join(", ")}${names.length > 25 ? ", ..." : ""}`);

  // npm skips a folder that already exists, so broken ones are removed first.
  for (const { key } of problems) {
    try {
      fs.rmSync(path.join(root, key), { recursive: true, force: true });
    } catch (error) {
      console.log(`[ensure-deps] could not remove ${key}: ${error.code ?? error.message}`);
    }
  }
  // Only the broken packages are replaced. (A full "npm ci" is deliberately not used here: it wipes
  // the whole node_modules folder, which is too risky to do while the app is starting.)
  const status = npm(["install", "--include=optional"]);
  ({ problems } = findProblems());
  ensurePrismaClient();
  console.log(problems.length === 0 ? "[ensure-deps] repair finished" : `[ensure-deps] still broken: ${problems.map((p) => `${p.key} (${p.problem})`).slice(0, 15).join(", ")} (npm exit ${status})`);
} catch (error) {
  // Never block start-up: the application reports its own, clearer error if something is wrong.
  console.log(`[ensure-deps] check skipped: ${error && error.message ? error.message : error}`);
}
