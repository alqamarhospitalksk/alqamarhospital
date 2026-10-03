// Runs before `next dev` / `next start` (npm "predev" / "prestart").
//
// On the hosting platform the app's node_modules can come up with packages that Next.js insists
// on missing or incomplete (the TypeScript type packages: the folder is there but files such as
// index.d.ts are not). Next.js then tries to install them itself, which fails because the
// platform's default npm cache folder is read-only. This repairs the folder first, using a cache
// the app is allowed to write to. When nothing is wrong it does nothing.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
// The exact files Next.js checks for (plus the other build tools), as [package, file inside it].
const needed = [
  ["typescript", "package.json"],
  ["typescript", "lib/typescript.js"],
  ["@types/react", "index.d.ts"],
  ["@types/react-dom", "index.d.ts"],
  ["@types/node", "index.d.ts"],
  ["tailwindcss", "package.json"],
  ["@tailwindcss/postcss", "package.json"],
  ["prisma", "package.json"],
];

// Looks on disk (not with require.resolve, which package "exports" rules can block).
function packageDir(pkg) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

const broken = [];
for (const [pkg, file] of needed) {
  const dir = packageDir(pkg);
  if (!dir || !fs.existsSync(path.join(dir, file))) broken.push({ pkg, dir });
}
if (broken.length === 0) process.exit(0);

console.log(`[ensure-deps] missing or incomplete: ${[...new Set(broken.map((b) => b.pkg))].join(", ")}`);
// A folder that exists but lacks files would be skipped by npm, so remove it first.
for (const { dir } of broken) {
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.log(`[ensure-deps] could not remove ${dir}: ${error.code ?? error.message}`);
    }
  }
}

const cache = path.join(os.tmpdir(), "careledger-npm-cache");
const result = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline", "--cache", cache], {
  cwd: root,
  stdio: "inherit",
  shell: true, // needed on Windows, where npm is a .cmd file
  env: { ...process.env, NODE_ENV: "development", npm_config_cache: cache },
});
// Never block start-up: if the repair fails, Next.js reports its own, clearer error.
console.log(result.status === 0 ? "[ensure-deps] repair finished" : `[ensure-deps] repair did not complete (exit ${result.status})`);
