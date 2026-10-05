# Clinic Management System — Software Requirements Document

**Prepared from:** (customer requirement, as analyzed and annotated on 2026-08-17)
**Status:** Draft for customer review — items under "Open Questions / Assumptions" need confirmation before development starts.

---

## 1. Overview

A web-based Clinic Management System (CMS) to be built on **Node.js**, used by a single clinic/hospital to manage:

- Outpatient (OPD) registration and doctor consultation flow
- Diagnostic service billing: **Laboratory, ECG, ECO (Echocardiography), X-Ray, Ultrasound**
- **Operation Theater (OT)** admission, procedure, and discharge billing
- Cash collection at each counter and consolidated financial reporting for management

Two user roles are in scope:

| Role | Purpose |
|---|---|
| **Operator** | Front-desk / counter staff: registers patients, generates doctor slips, generates test receipts, manages OT admission/discharge billing. |
| **Management** | Clinic owner/admin: views analytics, manages doctors, staff, test catalogs & pricing, and expenses/payouts. |

---

## 2. Actors

- **Operator** — one or more staff, potentially at different counters simultaneously (reception, lab, X-ray, ECG, ECO, ultrasound, OT). See [Open Question §9.5](#95-concurrency--deployment).
- **Management** — clinic owner/admin, uses the dashboard and configuration tabs.
- **Doctor** — not a system user (no login implied by requirements); doctor data is a record managed by Management and referenced throughout OPD/OT flows.
- **Patient** — not a system user; a data subject only.

---

## 3. Functional Requirements

### 3.1 Authentication & Access Control

- FR-1.1: Every user (operator, management) logs in with a unique username/password.
- FR-1.2: The system enforces role-based access: operator screens vs. management screens are separated; an operator cannot reach dashboard/analytics/configuration screens, and management can reach everything an operator can (at minimum for oversight).
- FR-1.3: Every create/edit/cancel/discount/refund action is stamped with the acting user and timestamp (audit trail), because operators handle cash directly.
- FR-1.4: Passwords are stored hashed (never plain text); session expires after inactivity.

### 3.2 Patient Registration

- FR-2.1: Register a patient with: **Patient name, Father name, CNIC No., Mobile number, Date of birth, Gender, Address**.
  - *Gender* is required at registration because it is printed on the doctor slip (§3.3) but was absent from the original field list — added during analysis.
- FR-2.2: System auto-generates a unique **MR (Medical Record) Number** per patient on save. MR number is permanent and reused on every future visit.
- FR-2.3: Operator can search an existing patient by **MR number, CNIC, or mobile number** to avoid duplicate registration, and view that patient's visit/billing history.
- FR-2.4: Patient record is editable (e.g., correcting a typo, updating mobile number) — edits are audit-logged.

### 3.3 Doctor Slip (OPD Token) Generation

- FR-3.1: Operator selects a registered patient and a doctor to generate an **OPD slip**.
- FR-3.2: Slip layout:
  - Header: Hospital name/logo.
  - Left block: Patient details — Name, Age (computed from DOB), Gender.
  - Right block: Doctor details (name, specialization).
  - Right-margin column (~1 inch): checklist of test names, so the doctor can hand-mark which diagnostics (Lab, X-Ray, ECG, ECO, Ultrasound) the patient needs.
  - Center: **Token number** — sequential per doctor per day, restarting at 1 every day.
  - A **unique OPD number** — permanently identifies this specific consultation/appointment instance (distinct from the daily token number), used as the lookup key by every downstream diagnostic/OT module.
- FR-3.3: Doctor's consultation fee (fee varies per doctor, configured in §3.9) is collected at registration and recorded against that doctor for reporting.
- FR-3.4: OPD slip is reprintable.

### 3.4 Diagnostic Service Receipts (Laboratory, ECO, X-Ray, ECG, Ultrasound)

These five modules share one workflow pattern:

- FR-4.1: Operator opens the relevant tab (Laboratory / ECO / X-Ray / ECG / Ultrasound) and enters the **OPD number**.
- FR-4.2: System fetches patient + doctor info tied to that OPD number.
- FR-4.3: Operator selects one or more tests from that module's price list (§3.10).
- FR-4.4: Operator generates a receipt showing: patient & doctor details, OPD number, a **module-specific token number**, list of selected tests with price, and total payable.
- FR-4.5: Patient pays the operator at the counter; payment is recorded against that module for management reporting.
- FR-4.6: Receipt is reprintable.
- FR-4.7: Receipt supports a **discount** (with a reason/note) and a **cancellation/refund** (with a reason/note); both are flagged for management review, not silently deleted.
- FR-4.8: Once the test is performed, the operator/technician can attach or type the **result/report** against that token, so it becomes part of the patient's permanent record and can be reviewed or reprinted on a later visit.

### 3.5 Operation Theater (OT)

- FR-5.1: **Admission** — patient is assigned a room or bed; each room/bed type has its own per-day rate (configured in §3.10).
- FR-5.2: Room/bed list shows current **occupancy status** (vacant/occupied) so the operator only assigns an available one.
- FR-5.3: **Booking** — doctor diagnoses and recommends a procedure; operator books an OT date/time and assigns the performing doctor.
- FR-5.4: **Procedure** — at the time of operation, the medicines and supporting tools/consumables used are added to the patient's OT bill.
  - FR-5.4a: Medicines/tools used are deducted from a **stock/inventory list**, so management can see quantity on hand and get a low-stock warning.
- FR-5.5: **Discharge** — after the doctor's discharge recommendation, the operator closes the OT case.
- FR-5.6: **Final slip** — system generates one consolidated bill covering: doctor fee, room/bed fee (days occupied × rate), OT/theater fee, medicines & consumables used. Patient pays this to be discharged.

### 3.6 Management Dashboard

- FR-6.1: Cash analytics — today / weekly / monthly, broken down by: Doctor consultation fees, Laboratory, ECO, ECG, X-Ray, Ultrasound, Operation Theater.
- FR-6.2: Operational counts — number of tests performed per day per module; number of patients seen per doctor per day.
- FR-6.3: General/summary analytics relevant to clinic performance (patient volume trend, top doctors, revenue vs. expense).
- FR-6.4 *(added)*: Custom date-range filter and export (PDF/Excel/print) for any report on the dashboard.

### 3.7 Expenses & Payouts

- FR-7.1: A tab to pay: doctor fees (per the split mechanism, §3.9), employee salaries, and module-related expenses (Lab, ECO, ECG, etc.), plus general daily/monthly clinic expenses.
- FR-7.2: Dashboard revenue figure = total income − total expenses/payouts recorded here.
- FR-7.3: An **Employee Registration** tab (name, designation, contact, joining date, monthly salary) so a salary payment can be linked to a specific employee record, not entered as a free-text expense.

### 3.8 Doctor Registration

- FR-8.1: Register a doctor with: Name, Specialization, Availability (days/times), Consultation fee.
- FR-8.2: **Split-fee mechanism** — percentage or fixed amount of the doctor's fee retained by the clinic vs. paid out to the doctor (original text said "Slit fee mechanism" — clarified during analysis). This split is used by FR-7.1 payouts and FR-6.1 analytics.

### 3.9 Test Types & Price Management

A configuration area, one screen per module, where Management can view existing entries, add new ones, and edit price:

| Module | Fields |
|---|---|
| Laboratory | Test name, price |
| X-Ray | Test type name, price |
| ECG | Test name, price |
| ECO | Test name, price |
| Ultrasound | Test name, price |
| Operation Theater | Room/bed types with per-day price, OT (theater) fee, operating-doctor fee, medicine catalog (with stock qty), surgical/consumable tools catalog (with stock qty) |

---

## 4. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Security | Role-based auth (§3.1); hashed passwords; audit trail on financial and record-editing actions. |
| Data protection | Patient data (CNIC, DOB, medical results) is sensitive — access restricted to authenticated roles only; recommend HTTPS in production. |
| Backup | Regular (e.g., daily) automated database backup; retention period to be confirmed with customer. |
| Availability | System should tolerate multiple counters (reception, lab, X-ray, ECG, ECO, ultrasound, OT) submitting concurrently without token/number collisions. |
| Printing | Slip/receipt layouts must be print-friendly for the clinic's chosen printer (thermal or A4 — to confirm) and include the hospital logo/header. |
| Auditability | All discounts, cancellations, refunds, and record edits are logged with user + timestamp, not hard-deleted. |
| Browser/device | Desktop-browser oriented (counter PCs); confirm if tablet/mobile access is also required. |
| Scalability | System should scale from a single clinic today to higher load (more counters, more patients/day, future multi-branch — see Open Question 6) without a redesign: stateless app layer so multiple Node.js instances can run behind a load balancer, and a database that can handle growing OPD/receipt volume (indexed by MR number, OPD number, date) as historical records accumulate over years. |
| Caching & performance | Frequently-read, rarely-changed data should be served from a cache instead of hitting the database every time, to keep counter operations (registration, slip/receipt generation) fast even under concurrent load: <br>• **Cache candidates:** test/price catalogs (Lab, X-Ray, ECG, ECO, Ultrasound, OT room/bed rates), doctor list & fee/split config, dashboard summary figures (today/weekly/monthly cash totals). <br>• **Cache invalidation:** any price/catalog/doctor edit by Management immediately invalidates (or updates) the corresponding cache entry so operators never bill an old price. <br>• **Not cached / always live:** patient lookup, OPD/token number generation, and payment recording — these must read/write the source of truth directly to avoid duplicate tokens or stale balances. <br>• Suggested approach: in-memory cache (e.g., Node.js in-process cache) for a single-server deployment, or a shared cache (e.g., Redis) once the app runs on multiple instances (ties into the Scalability row above). |

---

## 5. Key Data Entities (draft)

- **Patient**: MR number (PK), name, father name, CNIC, mobile, DOB, gender, address, created_by, created_at.
- **Doctor**: id, name, specialization, fee, availability schedule, split-fee rule.
- **Employee**: id, name, designation, contact, joining date, salary.
- **OPD Visit**: OPD number (PK), patient (FK), doctor (FK), daily token number, fee charged, date, created_by.
- **Diagnostic Test Catalog** (per module: Lab/ECO/X-Ray/ECG/Ultrasound): id, module, test name, price, active flag.
- **Diagnostic Receipt** (per module): id, OPD number (FK), module token number, test items (FK to catalog + price at time of sale), discount, status (paid/cancelled/refunded), result/report (nullable, filled later), created_by, created_at.
- **Room/Bed**: id, type, per-day rate, status (vacant/occupied).
- **OT Case**: id, patient (FK), doctor (FK), room/bed (FK), admit date, discharge date, procedure date/time, status (booked/in-progress/discharged), line items (doctor fee, room fee computed, OT fee, medicines used, tools used), total.
- **Inventory Item** (medicine/tool): id, name, unit, quantity on hand, low-stock threshold.
- **Expense/Payout**: id, type (doctor payout / salary / module expense / general expense), linked entity (doctor or employee, nullable), amount, date, note, created_by.
- **User**: id, username, password_hash, role (operator/management).

---

## 6. Core Workflows (summary)

1. **New patient visit:** Register/search patient → generate OPD slip with doctor + token → collect consultation fee.
2. **Diagnostic order:** Doctor marks tests on the slip → patient returns to relevant counter → operator enters OPD number → selects tests → generates receipt → collects payment → (later) result/report attached to that token.
3. **OT case:** Doctor recommends procedure → operator books room/bed + OT slot + doctor → procedure logged with medicines/tools consumed (deducted from stock) → discharge → consolidated final bill → payment → room/bed freed.
4. **Management oversight:** Dashboard aggregates all of the above by day/week/month and by module/doctor; expenses & payouts entered separately; revenue = income − expenses.

---

## 7. Open Questions / Assumptions


1. **Payment modes** — cash only, or also card/bank/online?
2. **Printing hardware** — thermal receipt printer vs. A4 printer; need the hospital's logo file.
3. **Backup & retention policy** — how often, how long to keep records.
4. **Multi-branch** — single location only, or multiple branches under one system?

## 8. Out of Scope (unless customer confirms otherwise)

- Doctor/patient self-service portals or mobile apps.
- Insurance claims processing.
- SMS/email notifications/reminders.
- Multi-branch consolidation (see Open Question 6).
- Online/advance appointment booking (current flow is walk-in/token-based only).
