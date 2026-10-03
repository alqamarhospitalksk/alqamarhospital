// Runs before `next dev` / `next start` (npm "predev" / "prestart").
//
// On the hosting platform the app's node_modules can come up without some packages that Next.js
// insists on (the TypeScript type packages). Next.js then tries to install them itself, which fails
// because the platform's default npm cache folder is read-only. This repairs the folder first,
// using a cache the app is allowed to write to. When nothing is missing it does nothing.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const needed = [
  "typescript/package.json",
  "@types/react/package.json",
  "@types/react-dom/package.json",
  "@types/node/package.json",
  "tailwindcss/package.json",
  "@tailwindcss/postcss/package.json",
  "prisma/package.json",
];

// Looks on disk (not with require.resolve, which package "exports" rules can block).
function installed(file) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", file))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

const missing = needed.filter((file) => !installed(file));
if (missing.length === 0) process.exit(0);

console.log(`[ensure-deps] missing: ${missing.join(", ")} - installing from package-lock.json`);
const cache = path.join(os.tmpdir(), "careledger-npm-cache");
const result = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline", "--cache", cache], {
  cwd: root,
  stdio: "inherit",
  shell: true, // needed on Windows, where npm is a .cmd file
  env: { ...process.env, NODE_ENV: "development", npm_config_cache: cache },
});
// Never block start-up: if the repair fails, Next.js reports its own, clearer error.
if (result.status !== 0) console.log("[ensure-deps] repair did not complete (exit " + result.status + ")");
