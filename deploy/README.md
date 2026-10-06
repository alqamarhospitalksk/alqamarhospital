# Putting Al Qamar Hospital on GoDaddy (cPanel "Setup Node.js App")

Everything here was tested on a fresh database built from `schema.sql` and on a production build:
every screen, every role and every payment calculation. The cPanel steps themselves have not been
run on GoDaddy, so follow them in order and note any error message.

## Before you start

1. Your cPanel must show **Setup Node.js App**. Choose Node.js **20 or newer**.
2. **HTTPS is required.** The login cookie is "secure" in production, so on plain `http://` nobody can sign in. Use the free AutoSSL certificate.
3. The database must be **InnoDB** (GoDaddy's default). Do not use MyISAM.
4. Keep the `.env` file and passwords off git and off any shared folder.

## Step 1 — Database

1. cPanel → **MySQL Databases**: create a database and a user, and give the user *All privileges*.
2. phpMyAdmin → select the database → **Import** → `deploy/schema.sql`. This creates all 35 tables.
   (Do **not** use `prisma migrate deploy` — the old migration history fails on InnoDB.)

## Step 2 — First login

On your own PC, in the project folder:

```bash
node deploy/create-admin.mjs owner "A-Temporary-Password-1" "Clinic Owner"
```

Paste the one `INSERT` line it prints into phpMyAdmin → **SQL** tab → Go. At first sign-in the owner must
choose a new password. Create all other staff logins from **User access** (they also must change their password at first sign-in).

## Step 3 — Upload the app

Zip the `frontend` folder **without** `node_modules`, `.next` and `.env`. Upload it with **File Manager**
to e.g. `/home/USER/careledger` and extract it. Never upload `node_modules` from Windows.

## Step 4 — Create the Node.js app

cPanel → **Setup Node.js App** → **Create Application**:

| Setting | Value |
|---|---|
| Node.js version | 20 or newer |
| Application mode | Production |
| Application root | `careledger` |
| Application URL | your domain |
| Application startup file | `deploy/server.js` |

Add these **environment variables** on the same page (cPanel prefixes names, e.g. `cpuser_careledger`):

| Variable | Value |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | your database user |
| `DB_PASSWORD` | your database password |
| `DB_NAME` | your database name |
| `DATABASE_URL` | `mysql://USER:PASSWORD@localhost:3306/DBNAME` |
| `TZ` | `Asia/Karachi` |
| `NODE_ENV` | `production` |
| `DEV_ACCESS_PASSWORD` | a long random password |

Do **not** add `ENABLE_DEV_CONSOLE` — it keeps the developer console (which can wipe the database) switched off.

## Step 5 — Install and build

1. On the Node.js app page click **Run NPM Install**.
2. cPanel → **Terminal**. Copy the "Enter to the virtual environment" command shown at the top of the Node.js app page and run it. Then:

```bash
cd ~/careledger
npx prisma generate
npm run build
```

If `npm run build` is killed for lack of memory, build on your PC (`npm run build`), upload the `.next`
folder, and skip the build command — but still run `npx prisma generate` on the server.

3. Click **Restart** on the Node.js app page.

## Step 6 — HTTPS and check

1. cPanel → **SSL/TLS Status** → run **AutoSSL** for the domain, then **Domains → Force HTTPS Redirect**.
2. Open `https://your-domain/api/health` — it must say `{"status":"ok"}`.
3. Open `https://your-domain` and sign in as the owner.

## Step 7 — Backups (do not skip)

- cPanel → **Backup** → download a full backup regularly, and
- phpMyAdmin → select the database → **Export** before every update and at least weekly.
- Keep copies on another PC or cloud drive, and once a month test importing one into a spare database.

## First-day checklist

- [ ] Owner password changed.
- [ ] *Hospital settings*: name, address, phone, logo.
- [ ] *Doctors*: fee, hospital/doctor split, availability, diagnostic shares.
- [ ] *Test & Price Catalog* (Lab login): lab / X-Ray / ECG / ECO / ultrasound tests and prices.
- [ ] *Rooms & beds*, *Employees* (with pay-day), *Inventory*.
- [ ] *Medicine catalog* and *Suppliers*. Name pack levels like `BOX`, `CARTON` — never the same as the base unit.
- [ ] A login for every staff member.
- [ ] Print one OPD slip and one receipt on the real printer.

## Updating the app later

1. Export the database (phpMyAdmin) first.
2. Upload the changed files (or the new zip) over the old ones — never overwrite `.env` settings in the panel.
3. **Run NPM Install** (only if `package.json` changed), then in Terminal: `npx prisma generate` and `npm run build`.
4. If an update includes a new `.sql` file, import it in phpMyAdmin.
5. Click **Restart**.

## If you want the data from your computer

Read this first: your computer's database contains a few leftover test records pointing to deleted
patients/sales (9 OPD visits, 5 receipts, 1 OT case and 1 store payment — about PKR 12,600, all from early
September). A real MySQL refuses such rows when you edit them, so the simplest and safest choice is to
**start clean** and keep your computer's database as an archive. If you still want the old data, ask for help.

## Files in this folder

| File | What it is |
|---|---|
| `schema.sql` | Creates all tables on an empty InnoDB database |
| `create-admin.mjs` | Prints the SQL for the first login |
| `server.js` | Start file for cPanel Node.js hosting |
