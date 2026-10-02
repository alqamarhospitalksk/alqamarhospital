// Runs once when the server starts.
//
// Every "today" in this app (OPD tokens, daily totals, day closing) means the clinic's calendar
// day. Hosting servers usually run in UTC, which would start "today" five hours late in Pakistan,
// so default the process to the clinic's zone unless the host sets TZ itself.
export function register() {
  if (!process.env.TZ) process.env.TZ = "Asia/Karachi";
}
