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

## 8. What was built (15 October 2026)

Sections 1–7 above are the original plan. This section records the client's answers and the final behaviour, which takes precedence where they differ.

**The client's answers**

| # | Answer | Built as |
|---|---|---|
| 1 | Under 24 hours = 1 day; from 24 hours on, charge by calendar date. | `chargeDateKeys` in `lib/admission.ts`. Admitted on the 1st at 10:00 and still in on the 2nd at 14:00 = 2 days. The count stops at the final invoice. |
| 2 | The doctor fee is charged by default; the operator marks "did not arrive" for a day, and that day's fee is dropped. | Each day row has `doctorVisited` (default true). The "Arrived / Did not arrive" button is on the admission page. The doctor's admission split applies per visited day. |
| 3 | The technician fee is hospital income and differs by admission type; technicians are salaried staff. | Default technician fee per day for each admission type, set on **Rooms & beds**. It is copied into each admission, and the operator can edit it. It is not part of any doctor share. |
| 4 | A suspicious patient is a critical admission, for both accommodation and treatment. | Category "Critical / suspicious". It can only use Critical-care rooms, or a manual room with a custom price. |
| 5 | The patient cannot leave with money owed. | Discharge requires the hospital balance at exactly 0 and the store's medicine marked paid. An excess advance must be handed back first (a "Refund excess" button). |
| 6 | No discount for now. | There is no discount anywhere on the admission bill. |
| 7 | A NICU newborn is registered as a new baby patient, then admitted like everyone else. | "Register newborn" inside the admit form for NICU. It creates the patient record (with its own MR number; the parent's mobile is allowed). |

**Your suggestions**
- There is no "Admit" button on the OPD desk. Admitting is done from the new **Admissions** page.
- **Rooms & beds** now has:
  - a category for each room/bed (Private, Ward, Critical care, NICU)
  - whether its daily charge is per room or per bed
  - live occupancy
  - an "Admission charges" panel with the technician fee per day for each admission type

**Changes from the plan**
- **OPD link dropped**: `opdVisitId` is not stored, because there is no OPD admit button.
- **Operations**: "Add operation" on the admission creates an OT case with `admissionId`. That case is billed, paid and discharged only through the admission:
  - The OT page shows "Billed with ADM-…" and refuses payments and discharge for it.
  - Items added to it on the OT page must be Due.
  - The surgeon's share counts when the admission is discharged.
- **OT medicine from the store**: the OT/Home medicine fields were removed from "New OT Admission" (follow-up request, 15 October).
  - The store's In-patients page lists open OT cases next to admissions. The store issues OT/home medicine to the OT patient on credit (`MedicineSale.otCaseId`).
  - At discharge the counter pays the store, and the store marks it paid.
  - Only then does "Discharge & Bill" unlock on the OT page (the API also refuses before that).
  - The OT invoice lists the store medicine. Older OT cases keep and show their manually typed medicine amounts.
- **No shared FEFO helper**: the store issues in-patient medicine from the existing Sell page in an "in-patient" mode (`/medical-store/sell?admissionId=…`). No payment or discount; a Ward / OT / Home choice instead. The FEFO code therefore stays in one place, and no shared helper was needed.
- **Changing the stay**: room, doctor and rates can be changed (one "Room / doctor / rates" dialog). Days already charged keep their rates; the change applies from the next day unless "also the current day" is ticked. Extra charges (oxygen, dressing…) can be added to the bill.
- **Bill structure**: two parts.
  - The hospital part is room, visited doctor days, technician, extras and operations. It is paid to the operator (`Payment.admissionId`; advances allowed while admitted).
  - The store part is the credit medicine. It is paid at the store, and **Mark paid** on the store's In-patients page creates the store's Payment rows. The store income therefore counts on the day the cash arrives (including in day closing), and nothing is counted twice.
- **Returns on unpaid credit**: medicine returned before the store is paid is a CREDIT return. It lowers what is owed and moves no cash.
- **Final invoice**: daily charges stop and the store can no longer issue medicine. "Reopen" is possible if the patient stays.
- **Cancel**: an admission made by mistake can be cancelled while nothing has been paid, issued or operated on it.
- **Reporting**:
  - "In-patient admission" is a new income line on the dashboard and the reports.
  - The dashboard has a "Currently admitted" card.
  - Admission visit earnings are in the Payouts page's doctor balances.
- **Database update**: a migration (`20261015120000_admissions`), an idempotent step in `scripts/apply-db-updates.cjs` (runs on the server at start-up), and the regenerated `deploy/schema.sql`.





