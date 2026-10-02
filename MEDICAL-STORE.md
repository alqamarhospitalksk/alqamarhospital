# Medical Store Module — How It Works

The Medical Store module is CareLedger's in-house pharmacy: it manages the medicine
catalog, stock levels (via expiry-dated batches), purchases from suppliers, sales to
patients/walk-in customers, stock adjustments, and returns — with a full audit trail
for every stock movement.

Only users with role **MEDICAL_STORE** or **MANAGEMENT** can access any page or API
route in this module (enforced per-route server-side, not just hidden in the nav).

---

## 1. Pages & Features

### Store Dashboard — `/medical-store`
- Today's Revenue, Low Stock count, Expiring-soon count, Expired count (auto-refreshes every 15s).
- Revenue trend chart (Today / Weekly / Monthly / Yearly).
- Stock-status pie chart — every medicine is counted in exactly one bucket (OK / Low / Expiring / Expired), worst status wins, so nothing is double-counted.
- Low Stock, Expiring Soon, and Expired bar-chart panels.

### Medicine Catalog — `/medical-store/catalog`
- Add/edit medicines: Name, Generic Name, Category (Tablet/Syrup/Injection/Capsule/Ointment/Other), Base Unit (Strip/Bottle/Box/Piece/Vial), Sale Price (per base unit), Low-Stock reorder threshold.
- **Dynamic packaging levels** — configure however a medicine is actually packed, e.g. "1 Strip = 10 Tablets", "1 Box = 10 Strips", with a live "1 X = N units" preview. Levels are unlimited and medicine-specific.

### Purchase / Stock In — `/medical-store/purchase`
- Pick a supplier, then add one line per medicine received.
- Per line: batch number, which packaging level it was received as (e.g. "Box"), quantity at that level, total cost paid, optional sale-price override for this batch, expiry date.
- The system converts the entered level + quantity into base units automatically and back-calculates the cost per base unit.
- Every purchase creates a new, separately tracked **batch** — nothing merges into existing stock.
- Recent Purchases history table below the form.

### Sell Medicine (POS) — `/medical-store/sell`
- Select a registered patient (search by MR#/name) or type a walk-in customer name.
- Add medicine lines; quantity is entered per packaging level (e.g. "2 Strips + 3 loose tablets"). Live stock and price shown per line.
- Optional discount in PKR (a reason is required if the discount is greater than zero).
- Payment method: Cash / Card / Bank Transfer / Online.
- "Complete Sale" posts the transaction and opens a printable 80mm receipt with a daily token number.
- Recent Sales table with a re-print button.

### Stock Adjustments — `/medical-store/adjustments`
- Search a medicine, pick the exact batch (shows remaining quantity + expiry), choose a reason — Damage, Expired, Return to Supplier, or Stock Correction — enter the quantity to remove, and a required free-text reason.
- Adjustments only ever **reduce** stock; there is no "add stock" adjustment — stock only increases via Purchases or a restocked Sale Return.

### Suppliers — `/medical-store/suppliers`
- Add a supplier (Name, Contact Person, Phone, Address) and view the list.
- Add-only — there's currently no edit/delete for suppliers.

### Purchase Returns — `/medical-store/returns/purchase`
- Pick a supplier, see every batch with remaining stock from that supplier's purchases, enter a return quantity per batch and a reason.
- Decrements the batch and credits the return at that batch's original purchase cost.

### Sale Returns — `/medical-store/returns/sale`
- Find a past sale, see its line items with how much of each is still returnable.
- Enter a return quantity per item, choose **Return to Sellable Stock** or **Quarantine/Damaged**, and a reason.
- Refunds at the original sale price; only restocks the batch if "Return to Sellable Stock" was chosen.

### Reports — `/medical-store/reports`
- Date-range picker (Daily/Weekly/Monthly presets or custom range).
- Stat tiles: Sales Revenue, Net Revenue (after sale returns), Purchases Cost, Purchase Returns, current Stock Value (live snapshot at purchase cost), Discounts Given.
- Tables: Top-Selling Medicines, Sales by Category, Purchases by Supplier.

---

## 2. End-to-End Procedure

```
1. Catalog setup
   Add the medicine → define its packaging levels (e.g. Strip → Box → Carton)
   → set its default sale price and low-stock threshold.

2. Supplier setup
   Add the supplier you buy this medicine from.

3. Purchase (stock in)
   Record a purchase from the supplier → choose which packaging level was
   received and the quantity → the system creates a new dated batch and
   works out the per-unit cost automatically.

4. Sell (stock out)
   Ring up a sale for a patient or walk-in customer. Stock is drawn
   automatically using FEFO (First-Expiry-First-Out) — the earliest-expiring,
   non-expired batch is used first, splitting across batches if one batch
   isn't enough. Already-expired batches can never be sold.

5. Adjustments (as needed)
   Write off damaged or expired stock, or correct a miscount, against a
   specific batch — always a reduction, with a reason on record.

6. Returns (as needed)
   Purchase Return — send stock back to a supplier, credited at cost.
   Sale Return — a patient returns medicine; refund at sale price, and
   optionally put the stock back if it's still sellable.

7. Monitor
   Dashboard for a live day-to-day view (revenue, low/expiring/expired
   stock); Reports for a date-range financial breakdown.
```

---

## 3. Business Rules Worth Knowing

- **FEFO, not FIFO** — sales always draw from the batch expiring soonest, not the batch purchased first.
- **No selling expired stock** — once a batch's expiry date has passed, it's excluded from sales entirely (it still shows up in the Dashboard's "Expired" bucket and can be written off via Adjustments).
- **No negative stock** — sales, adjustments, and purchase returns all validate against the batch's actual remaining quantity.
- **"Expiring soon" means one real calendar month out**, not a fixed 30 days, so the count doesn't drift across shorter/longer months.
- **Packaging levels are cumulative** — each level is defined relative to the level below it (e.g. "1 Box = 10 Strips", "1 Strip = 10 Tablets" → 1 Box = 100 Tablets), computed automatically wherever quantities are shown.
- **Purchase cost is derived, not typed in per unit** — staff enter the total cost paid for the received quantity, and the system works out the cost per base unit for that batch.
- **A batch can override the catalog sale price** — useful when a specific batch needs to sell at a different price than the item's default.
- **Medicine sales feed the hospital's shared revenue system** — a medicine sale posts into the same central Payment records used by OPD/Lab/OT/Emergency, so it counts toward hospital-wide revenue reporting, not just the Medical Store's own numbers.
- **Every stock movement is logged** — purchases, sales, adjustments, and both return types all write to an internal stock ledger with before/after quantities, for a full audit trail per medicine and per batch.

---

## 4. Access Control

Every Medical Store page and API route requires the signed-in user's role to be
`MEDICAL_STORE` or `MANAGEMENT`. Any other role gets a 403 from the API, and the
Medical Store section is hidden from their navigation entirely.
