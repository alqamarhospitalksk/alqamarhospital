// Start file for hosting panels that run Node apps through a launcher (cPanel "Setup Node.js App",
// Passenger, Plesk...). On a VPS you can simply run `npm start` instead.
//
// Run `npm run build` first, then point the panel's "Application startup file" at this file.
process.env.NODE_ENV = "production";
process.env.TZ = process.env.TZ || "Asia/Karachi"; // keep "today" = the clinic's today

const { createServer } = require("node:http");
const next = require("next");

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname + "/.." });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Al Qamar Hospital ready on port ${port}`);
  });
});
