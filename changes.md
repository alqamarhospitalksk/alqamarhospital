# Admission module: integration approach

I went through the current code: the Prisma schema, the OT APIs, the doctor-share logic, the medical-store sale flow and the sidebar roles. Most of what the client wants can reuse things the app already has. The real new work is three things: **daily charges that add themselves**, **medicine the store issues on credit to an admitted patient**, and **a settlement step between the operator and the store that must happen before discharge**.

## 1. What already exists and what we reuse

| Need | What exists today | Plan |
|---|---|---|
| Rooms and beds with a daily rate | `RoomBed` (name, roomType, dailyRate) | Add a category (Private / Ward / ICU-Critical / NICU) and show which beds are occupied |
| Doctor earnings | `computeDoctorShare` in [lib/doctor-share.ts](lib/doctor-share.ts) covers OPD, OT and diagnostics | Add admission daily fees, with their own split |
| Taking payment in parts | OT `RECORD_PAYMENT` with advances and part-payments | Same pattern on the admission |
| "Can't discharge while money is owed" | OT discharge check in [app/api/ot/[id]/route.ts](app/api/ot/[id]/route.ts#L293-L301) | Same check, plus "the store has marked it paid" |
| Selling medicine first-expiry-first-out | [app/api/medical-store/sales/route.ts](app/api/medical-store/sales/route.ts) | Move the batch-picking code into a shared `lib/` helper so the in-patient page uses the same code |
| Database changes on GoDaddy | `prisma/migrations` + [scripts/apply-db-updates.cjs](scripts/apply-db-updates.cjs) | Each schema change goes into both, as it does now |

## 2. Data model changes

**New: `Admission`** (the admitted patient's profile)
- `admissionNumber` (`ADM-YYYYMMDD-####`, built from `DailySequence` like OT numbers), `patientId`, the attending `doctorId`, and an optional `opdVisitId` when the patient came through OPD.
- `category`: `MEDICAL` (medical treatment), `NICU`, `SURGICAL` (operation, then treatment), `CRITICAL`, `OTHER`.
- `accommodation`: `PRIVATE_ROOM`, `WARD_BED`, `CRITICAL_CARE`. Plus an optional `roomBedId` or a free-text `roomLabel`.
- Rates copied in at admission and editable by the operator: `dailyRoomRate`, `dailyDoctorFee`, `dailyTechnicianFee`. Later changes to a doctor's profile won't change an existing stay.
- `status`: `ADMITTED` → `INVOICED` → `DISCHARGED` (or `CANCELLED`).
- Settlement fields: `admittedAt`, `invoicedAt`, `billedThrough`, `dischargedAt`, `storeSettledAt`, `storeSettledById`, plus diagnosis and notes.

**New: `AdmissionCharge`** (one row per charge on the bill)
- `type`: `ROOM`, `DOCTOR_VISIT`, `TECHNICIAN`, `OTHER`, with `chargeDate`, `amount` and `doctorId` (used for the doctor's share).
- A unique key on `(admissionId, type, chargeDate)` for the daily types, so creating daily charges can safely run any number of times without double-charging.

**Changed tables**
- **`Doctor`**: add `admissionDailyFee`, `admissionSplitType` (PERCENTAGE / FIXED) and `admissionSplitValue`. This gives the separate split the client asked for, independent of the OPD split.
- **`RoomBed`**: add `category` and a "currently occupied by" lookup.
- **`OtCase`**: add an optional `admissionId`. An operation done during an admission is still an OT case, so OT reports and the surgeon's share keep working, but it is billed through the admission.
- **`MedicineSale`**:
  - Add an optional `admissionId` and `otCaseId`.
  - Add `purpose`: `WARD`, `OT` or `HOME` (discharge medicine). This replaces today's manual "OT medicine" and "Home medicine" fields.
  - Add `creditStatus`: empty for normal counter sales, `UNSETTLED` or `SETTLED` for in-patient credit sales.
- **`Payment`**: add an optional `admissionId`.
- **`HospitalSettings`**: add a default technician fee per category, which the admission form fills in automatically.

## 3. How daily charges get added

There's no scheduler on the GoDaddy hosting, so I won't rely on a cron job. Instead, a helper `accrueAdmissionCharges(admissionId)` adds any missing ROOM, DOCTOR_VISIT and TECHNICIAN rows for every calendar date from the admission date up to today. After the final invoice, it stops at the invoice date.

It runs whenever the admission is opened, listed, invoiced or discharged. Because of the unique key, running it again never adds duplicates. If the patient changes room, the new rate applies from the next date.

## 4. End-to-end flow

```
OPD visit ──"Admit" button (prefills patient + doctor)──┐
Walk-in at counter ─────────────────────────────────────┤
                                                        ▼
Operator › Admissions › Admit patient
  category · Private/Ward/Critical · bed (or manual) · price · doctor · optional advance
                                                        │
          ┌───── daily: room + doctor fee + technician fee (automatic)
          │
          ├───── Medical store › In-patients › pick patient › issue medicine
          │        (stock leaves first-expiry-first-out, sale is UNSETTLED credit)
          │
          ├───── "Add operation" → OT case linked to admission
          │        (surgeon fee, anesthesia, hospital charges; OT medicine from store)
          │
          ▼
Operator › Generate final invoice   (status INVOICED, charges stop, store can't add more)
  Hospital charges + Store medicine (split into Ward/OT/Home) − advances = amount due
          │
Operator collects payment → hands store its share
          │
Store › In-patients › "Mark paid"   → creates the store's Payment rows (counted in store cash/day closing)
          │
Operator › Discharge  (blocked until hospital balance = 0 AND store settled)
```

Splitting the money this way keeps both sets of books correct. Only the hospital part is recorded against the admission. The store part becomes store income only when the store confirms it received the cash, so the dashboard won't count it twice.

## 5. Screens

**Operator**
- **Admissions page** (new sidebar item), with tabs for Admitted, Invoiced and Discharged.
- **Admit form**:
  - Patient search and category.
  - Accommodation: choose a free bed, or enter a manual room plus price (this covers critical patients with a custom price).
  - Doctor, with the daily fee filled in from the doctor's profile.
  - Technician fee, filled in from settings.
  - Optional advance payment.
- **Admitted profile page**:
  - Day-by-day bill and store medicines (view-only).
  - Linked operations and payments.
  - Actions: transfer bed, add operation, collect advance, generate invoice, print invoice, discharge.
- **OPD desk**: an "Admit" button on each visit row.
- **OT page**: the manual OT/Home medicine amount and notes fields are removed. Medicine comes from linked store sales, and discharge uses the same store-settlement check. Old cases keep their manual amounts, shown read-only.

**Medical store**
- **In-patients page** (new):
  - Lists active admissions and OT cases.
  - Selecting one opens a sell screen that reuses the existing sell page, with no payment step and a "purpose" choice (Ward/OT/Home).
  - A "Pending settlement" tab lists invoiced patients with a **Mark paid** button.
- **Returns**: when unused medicine comes back before the invoice, it reduces the patient's credit instead of paying out store cash. This needs a small change in `lib/store-refunds.ts`.

**Management**
- **Doctors form**: admission daily fee and admission split.
- **Rooms & beds**: category and occupancy.
- **Hospital settings**: default technician fees.
- **Payouts, reports and dashboard**: admission earnings in doctor shares, plus a "Currently admitted" card.

## 6. Build order

1. **Schema and setup**: migration, `apply-db-updates.cjs` step, doctor/room/settings fields and their forms.
2. **Admission core**: admit, daily charges, profile page, advances, bed transfer, invoice and discharge (the store check is off for now).
3. **Store in-patients**: shared sale helper, credit sales, the in-patients page, returns, the settlement step and the discharge check.
4. **Operations**: "Add operation" on an admission, and replacing the manual medicine fields on the OT page.
5. **Reporting**: printed invoice with the store section, doctor-share changes, dashboard and reports.

Each phase can be tested and released on its own.

## 7. Questions for the client before we start

1. **How are days counted?** By calendar date ("date change", as they wrote) means a patient admitted at 11 pm is charged for 2 days by 1 am. Is that what they want, or 24-hour periods? Is the discharge day charged?
2. **Doctor daily fee**: is it charged every day automatically even if the doctor doesn't do a round? Is the admission split a percentage per day or a fixed amount per day?
3. **Technician fee**: is it purely hospital income, or owed to a specific employee?
4. **"Suspicious patient"**: I've read this as *critical/serious* and treated it as an accommodation type with a custom price. Can they confirm?
5. **Leaving with money owed**: can a patient ever be discharged with a balance due (for example, staff or charity cases), or is it always blocked like OT is today?
6. **Discounts**: does the invoice discount apply only to hospital charges, with store medicine always at full price?
7. **NICU newborns**: should the baby get their own patient record, or be linked to the mother's MR number?

I haven't written any code yet. Once the open questions are answered (I can start on phase 1 with defaults that are easy to change later), I'll start with phase 1. I can also put this plan on a shareable page for the client.






Prompt:
below are the identified suggestion in your provided flow:
Operator:
Your: OPD desk: an "Admit" button on each visit row.
My Suggestion: No the admit button to be in admission page

Management:
Rooms & beds: category and occupancy.
Hospital settings: default technician fees.

My suggestion:
Rooma and Beds category and occupancy with charges settings per bed or per room and per NICO or critical patient room
technician fees for each category of admission per day.

Question answer fromt he clinet:
for days calculation first count the time if less than 24 hour charge for one day, but if it increase 24 hour then charge as per calendar

for question 2, give authority to operator to mark the doctor visit or not if not their daily fee will not be encounter in invoice, by default it will be mark as doctor arrive, while not arrive only in that case the operator will change state to not arrive, then no fee will eb charged for that day for the doctor.

3. it is hospital income, but the technician fee is different for the different types of admission, and the technician is the hospital employee and the hospital will pay their salary.

4. For suspicious patient there should be critical admission in both cases for accomodation treatemetn also.

5. while patient leave the patient should clear the due to dischage, if not clear the payment the discharge option will not work.

6. for now does not add the dicount section or part in invoice.

7. NICO has new admission as baby patient registration and then to admit in NICO with complete procedure as other admission patient.

address also the suggestions and anwer from client to the question, procedd it and go ahead for the integration.