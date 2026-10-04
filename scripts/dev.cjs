// Starts the development server (`npm run dev`).
//
// Turbopack is Next.js's fast compiler and is what you want on a developer PC (about 4x quicker
// to start and to open each page). It does not work inside the GoDaddy preview sandbox, though
// (it needs to open a local port there and is not allowed to), so there the older webpack
// compiler is used. The choice is automatic:
//   - Windows / macOS (a developer machine)  -> Turbopack
//   - Linux (the hosting preview)            -> webpack
// Override with DEV_BUNDLER=turbopack or DEV_BUNDLER=webpack when you need to.
const { spawn } = require("node:child_process");

const forced = (process.env.DEV_BUNDLER || "").toLowerCase();
const useWebpack = forced === "webpack" || (forced !== "turbopack" && process.platform === "linux");

const args = ["next", "dev", ...(useWebpack ? ["--webpack"] : []), ...process.argv.slice(2)];
console.log(`[dev] starting with ${useWebpack ? "webpack" : "Turbopack"}`);

const child = spawn("npx", args, { stdio: "inherit", shell: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
