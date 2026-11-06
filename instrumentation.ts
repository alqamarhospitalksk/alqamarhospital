// Runs once when the server starts, and the server does not answer requests until it has finished.
//
// 1. Every "today" in this app (OPD tokens, daily totals, day closing) means the clinic's calendar
//    day. Hosting servers usually run in UTC, which would start "today" five hours late in Pakistan,
//    so default the process to the clinic's zone unless the host sets TZ itself.
//
// 2. On Node, bring the database structure up to date before the first request (instrumentation-node.ts).
//    Hosts like GoDaddy Node.js Hosting have no terminal, so `npm run db:update` cannot be run by hand.
export async function register() {
  if (!process.env.TZ) process.env.TZ = "Asia/Karachi";

  // Imported only on Node (Next replaces NEXT_RUNTIME at build time), so the Edge build never sees "node:" modules.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runDbUpdates } = await import("./instrumentation-node");
    await runDbUpdates();
  }
}
