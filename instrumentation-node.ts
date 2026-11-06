// Node.js-only part of the start-up hook (see instrumentation.ts, which imports this only when running on
// Node: the Edge build of that file cannot contain "node:" imports).
//
// Brings the database structure up to date with scripts/apply-db-updates.cjs. On a host with no terminal and
// no SQL console (GoDaddy Node.js Hosting) nobody can run `npm run db:update` by hand, and a preview that is
// not built never reaches the "postbuild" run. The script only adds what is missing, checks each step first
// and never touches existing data, so running it on every start is safe and takes a fraction of a second.
// Rules: only on Linux hosting, or anywhere with AUTO_DB_UPDATES=true; AUTO_DB_UPDATES=false switches it off.
// On a Windows/Mac developer PC it is skipped, so it never fights with `prisma migrate`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function runDbUpdates() {
  const wanted = process.env.AUTO_DB_UPDATES === "true" || (process.env.AUTO_DB_UPDATES !== "false" && process.platform === "linux");
  if (!wanted) return;

  const script = join(process.cwd(), "scripts", "apply-db-updates.cjs");
  if (!existsSync(script)) return;

  // A separate process, because the script ends with process.exit() and must not stop the server.
  // It prints its own "[db-updates] ..." lines; a failure only logs, it never stops the app starting.
  await new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    const giveUp = setTimeout(() => {
      console.log("[db-updates] still running after 60 s; starting the app anyway");
      child.kill();
      resolve();
    }, 60_000);
    const done = () => {
      clearTimeout(giveUp);
      resolve();
    };
    child.on("exit", done);
    child.on("error", done);
  });
}
