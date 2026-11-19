# Medical Store — Complete User Guide

Al Qamar General Hospital's in-house pharmacy. This guide explains **what the module does**, **how to set it up**,
and **how to run it day by day**, step by step. (For the technical design see `MEDICAL-STORE.md`.)

**Who can use it:** users with the role **MEDICAL_STORE** (and MANAGEMENT through the server). Other roles do not see
the Medical Store menu.

---

## 1. The big idea in 60 seconds

1. A **medicine** (catalog) is only a description: name, how it is packed, sale price, low-stock level.
2. Stock is **never typed in directly**. It arrives through a **Purchase** from a **Supplier**, and every purchase
   creates a **batch**: a lot with its own batch number, expiry date, quantity and cost.
3. A **Sale** takes stock from batches automatically, **earliest expiry first (FEFO)**. Expired batches can never be sold.
4. Anything that changes stock (purchase, sale, adjustment, count, return) is written to the **Stock History**, so
   every movement can be traced.
5. Cash that passes the counter is checked every evening in **Day Closing**.

```
Catalog ──> Supplier ──> Purchase (creates batches) ──> Sell (FEFO)
                              │                             │
                              ▼                             ▼
                  Supplier payments                 Returns / Adjustments / Stock count
                              │                             │
                              └──────────► Reports, Dashboard, Day closing
```

---

## 2. Menu map (left sidebar)

| Group | Page | What it is for |
|---|---|---|
| Overview | **Store dashboard** | Today's revenue, low / expiring / expired stock, charts |
| Sales | **Sell medicine** | Point of sale (walk-in, registered patient, or in-patient credit) |
| Sales | **In-patients** | Issue medicine to admitted / OT patients on credit; "Mark paid" |
| Sales | **Sale returns** | Customer returns medicine |
| Sales | **Day closing** | Count the cash drawer at end of day |
| Stock | **Medicine catalog** | Add / edit medicines and packaging |
| Stock | **Stock adjustments** | Write off damaged / expired / corrected stock |
| Stock | **Stock count** | Physical count vs system quantity |
| Stock | **Stock history** | Every movement of one medicine |
| Stock | **Expiry tracker** | Batches near or past expiry |
| Stock | **Reorder list** | What to buy next (printable) |
| Purchasing | **Purchase (stock in)** | Receive stock from a supplier |
| Purchasing | **Suppliers** | Supplier list (add, edit, deactivate) |
| Purchasing | **Supplier payments** | What you owe suppliers; record payments |
| Purchasing | **Purchase returns** | Send stock back to a supplier |
| Reports | **Reports** | Date-range financial and sales reports, Excel export |

---

## 3. One-time setup (do this first)

### Step 1: Add suppliers (`Suppliers`)
1. Click **Add Supplier**.
2. Enter name (required), contact person, phone, address. Save.
3. Later you can **Edit**, or **Deactivate** a supplier (it disappears from new purchases; its history is kept) and **Reactivate** it.

### Step 2: Add medicines (`Medicine catalog`)
1. Click **Add Medicine**.
2. Fill in:
   - **Name** and **Generic name**
   - **Category**: Tablet, Syrup, Injection, Capsule, Ointment, Other
   - **Base unit**: the smallest thing you sell (Strip, Bottle, Box, Piece, Vial)
   - **Sale price** per base unit
   - **Low-stock level**: when stock falls to this, the medicine shows as Low and appears on the Reorder list
3. Add **packaging levels** to match how the medicine really comes. Each level is relative to the one below it:
   - "1 Strip = 10 Tablets", "1 Box = 10 Strips" → the screen shows "1 Box = 100 Tablets".
   - You may add as many levels as you need; they are specific to that medicine.
4. Save. You can edit it later; stock is not affected by editing the catalog.

> Tip: decide the **base unit** carefully. Prices, stock and low-stock levels are all counted in the base unit.

---

## 4. Receiving stock: Purchase (`Purchase (stock in)`)

1. Choose the **supplier**.
2. Add one **line per medicine received**:
   - **Medicine**
   - **Batch number** (from the box)
   - **Received as**: which packaging level you are counting in (for example "Box") and the **quantity** at that level
   - **Total cost paid** for that quantity (not per unit; the system works out the cost per base unit)
   - **Expiry date**
   - Optional **sale price for this batch** if it must sell at a different price from the catalog price
3. Save the purchase.

What happens: the system converts the quantity into base units, calculates the unit cost, and creates a **new batch**
for every line. Nothing is merged into an older batch. The purchase total is added to what you **owe that supplier**.
A "Recent purchases" table below the form shows past purchases.

---

## 5. Selling medicine: three ways

### 5A. Counter sale (`Sell medicine`), the everyday case
1. Pick a **registered patient** (search by MR number or name) **or** type a **walk-in customer name**.
2. Add medicine lines. Quantity is entered per packaging level, for example "2 Strips + 3 loose tablets". Each line
   shows live stock and price.
3. Optional **discount** in PKR. A **reason is required** if the discount is more than zero.
4. Choose the **payment method**: Cash, Card, Bank Transfer or Online.
5. Click **Complete Sale**. An 80 mm receipt with the day's token number opens for printing.
6. Re-print later from the **Recent sales** table.

Rules the system enforces: stock is taken **earliest expiry first** and can span several batches; **expired stock is
never sold**; you **cannot sell more than is in stock**.

### 5B. In-patient / OT medicine on credit (`In-patients`)
Used for patients admitted to the hospital or with an open OT case. They do not pay at the counter.
1. Open **In-patients**. It lists every admitted patient and open OT case, with what the store has issued so far.
2. Click **Issue medicine**. The Sell page opens in **in-patient mode**: patient fixed, **no discount, no payment**.
3. Choose the **purpose**: **Ward**, **OT**, or **Home (discharge)**. Add the medicines and complete.
4. The stock leaves normally, but the sale is recorded as **unpaid credit** on the patient's bill.
5. When the money reaches you (from the family, or handed over by the front desk), go to **Waiting for payment**
   and click **Mark paid**, choosing the payment method.
6. Mark paid creates the store's payment, so it **counts as store income and appears in that day's Day closing**.
   **The front desk cannot discharge the patient until this is done.**

Good to know:
- Once the admission's final invoice is generated, or the OT patient is discharged, you can no longer issue medicine to them.
- Credit medicine is **not** counted in the dashboard or reports until it is marked paid; it then counts on the day it was paid.

### 5C. Returns (`Sale returns`)
1. Find the past sale.
2. For each item enter the quantity being returned (the screen shows how much is still returnable).
3. Choose **Return to sellable stock** (goes back on the shelf) or **Quarantine / damaged** (does not).
4. Enter a **reason** and save. The refund is at the **original sale price**.
- A return on an **unpaid in-patient credit sale** only reduces what the patient owes. No cash moves and it is not
  a cash refund in Day closing. After the bill is paid, a return is a normal cash refund.

---

## 6. Keeping stock accurate

### Stock adjustments: remove stock
For damage, expiry, a return to the supplier, or a correction.
1. Search the medicine and **pick the exact batch** (shows remaining quantity and expiry).
2. Choose the reason type: **Damage, Expired, Return to Supplier, Stock Correction**.
3. Enter the quantity to **remove** and a written reason. Save.
- Adjustments only ever **reduce** stock. Stock only goes up through a Purchase or a restocked Sale return.
- **Damage and Expired** write-offs are also posted as **store wastage** (an expense at cost).

### Stock count: physical check
1. Open **Stock count**. It lists every batch with the quantity the system expects.
2. Type what you actually counted for any batch that differs (leave matching ones blank).
3. Add a note (for example "Monthly count, September") and save.
- Differences become adjustments automatically. **Shortages** are posted as store wastage at cost; **surpluses** are
  added to stock but are not treated as income.
- If a sale or return happened on a batch after you loaded the sheet, the save is refused for safety. Reload and count again.

### Expiry tracker
- Filter by **Already expired / within 30 / 60 / 90 days / all stock**.
- Shows the **value at risk** (cost of expired plus 30-day stock).
- Per batch you can go straight to a **Purchase return** (send it back to that supplier) or **Write off** (adjustment).

### Reorder list
- Lists every medicine at or below its low-stock level (expired stock is not counted as available) and medicines never stocked.
- Shows current stock, last supplier, last cost, a **suggested quantity** (top up to **twice the low-stock level**) and an
  estimated cost.
- **Print** the list to take to the supplier. (A medicine with no low-stock level gets no suggestion.)

### Stock history
- Choose a medicine to see every movement: Opening stock, Purchased, Sold, Added/Removed (adjustment),
  Customer returned, Returned to supplier, each with before/after quantity, who did it and why.

---

## 7. Supplier money

### Supplier payments
1. Open the page: it shows **Total you owe**, **Total paid**, and the number of suppliers with money due.
2. In **Record a payment**: choose supplier, amount, method, payment date (not in the future) and a note
   (cheque number, invoice number).
3. Save. The payment is also recorded as an **expense** on that date, so it flows into hospital expenses.
4. **Balance owed = purchases − payments − credit-mode purchase returns.**

### Purchase returns
1. Choose the supplier; see every batch of theirs with stock remaining.
2. Enter the quantity to return per batch and a reason.
3. The batch is reduced and credited at that batch's **original purchase cost**. The refund mode is either:
   - **Cash**: the supplier hands money back (recorded as a negative expense), or
   - **Credit**: no cash moves, it lowers the balance you owe the supplier.

---

## 8. End of day: Day closing
1. Open **Day closing** (today is pre-selected).
2. Read the figures: **Cash sales**, **Cash refunds**, and **Cash that should be in the drawer**. These are always
   recalculated by the server.
3. Count the physical cash and type it into **Count the drawer**. The screen shows at once whether it is
   **short, over or matching**.
4. Add a note if there is a difference. Click save to close the day.
5. **Past closings** lists earlier days with their differences.
Notes: you cannot close a future day; credit medicine appears only once it has been marked paid.

---

## 9. Monitoring

### Store dashboard (refreshes automatically)
- Today's revenue, Low stock count, Expiring soon, Expired.
- Revenue trend (Today / Weekly / Monthly / Yearly), a stock-status pie (each medicine counted once, worst status wins),
  and Low / Expiring / Expired panels.
- "Expiring soon" means one real calendar month ahead, not a fixed 30 days.

### Reports
- Pick a date range (Daily / Weekly / Monthly presets or custom).
- Tiles: Sales revenue, Net revenue (after returns), Purchases cost, Purchase returns, current Stock value (at cost),
  Discounts given.
- Tables: Top-selling medicines, Sales by category, Purchases by supplier.
- **Export to Excel** is available.

---

## 10. Recommended daily routine

**Morning**
1. Check the **Store dashboard** (low / expiring / expired).
2. Check **Waiting for payment** under In-patients for anything the front desk is chasing.

**During the day**
3. Sell at the counter (5A). Issue ward / OT medicine on credit (5B).
4. Receive deliveries with **Purchase** as they arrive.
5. Process customer returns (5C) and **Mark paid** when in-patient money arrives.

**End of day**
6. Do **Day closing**.

**Weekly / monthly**
7. Review the **Expiry tracker**; return or write off near-expiry batches.
8. Print the **Reorder list** and place orders.
9. Do a **Stock count**; record **Supplier payments**; review **Reports**.

---

## 11. Rules and limits to remember

| Rule | Meaning |
|---|---|
| FEFO | Sales use the batch that expires first, not the one bought first |
| No expired sales | Expired batches are blocked from sale; write them off or return them |
| No negative stock | Sales, adjustments and returns are checked against the real batch quantity |
| Cost is derived | You enter the total cost paid; the system works out per-unit cost |
| Batch price | A batch can have its own sale price instead of the catalog price |
| Discount needs a reason | Any discount above zero must be explained |
| Adjustments reduce only | Stock increases only by Purchase or restocked Sale return |
| Credit sales | In-patient medicine is income only when marked paid; discharge is blocked until then |
| Shared revenue | Store payments feed the hospital-wide payment records and expenses |
| Audit trail | Every stock movement and money action is logged with the user |

---

## 12. Quick troubleshooting

| Problem | Likely cause / fix |
|---|---|
| Medicine not available in Sell | No unexpired batch with stock; check Stock history and Expiry tracker |
| Cannot sell more than shown | Stock is limited to non-expired batches |
| Front desk cannot discharge a patient | Store credit unpaid: go to In-patients, **Waiting for payment**, **Mark paid** |
| Supplier missing in Purchase | It was deactivated; reactivate it in Suppliers |
| Stock count will not save | Stock moved after the sheet loaded; reload and recount |
| Day closing shows a difference | Recount, add a note; check returns and in-patient payments for that date |
| Cannot issue medicine to an in-patient | Their invoice is generated or they are discharged |
