# Al Qamar Hospital Management

Next.js clinic operations system using Chakra UI, Font Awesome, MySQL, and Prisma ORM.

## Local setup

1. Create a MySQL database:

```sql
CREATE DATABASE clinicdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Copy `.env.example` to `.env` and set the MySQL connection values and the starter-login passwords: `SEED_MANAGEMENT_PASSWORD`, `SEED_OPERATOR_PASSWORD`, `SEED_STORE_PASSWORD` and `SEED_LAB_PASSWORD`.

3. Install dependencies and apply the schema:

```bash
npm install
npm run db:migrate -- --name init
npm run db:seed
```

4. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/login` and sign in with `management`, `operator`, `store` or `lab` and the password configured in `.env`. The seed only creates logins that do not exist yet (it never resets a password), and each new login must choose its own password at first sign-in.

## Useful commands

```bash
npm run lint
npm run build
npm run db:generate
npm run db:validate
```

The seed creates starter users, zero-priced diagnostic catalog entries, and two OT beds. Management should configure real prices and inventory before using billing workflows.
