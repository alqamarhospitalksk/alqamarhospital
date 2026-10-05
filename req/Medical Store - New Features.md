# Medical Store: What's New

This guide explains every new feature and fix in the Medical Store, in simple words, with everyday examples.

All examples use made-up numbers. "Strip", "piece", "box" are just the units your medicines are counted in.

---

## Quick list

**New pages** (in the left menu):

1. Supplier Payments
2. Reorder List
3. Day Closing
4. Stock Count
5. Stock History
6. Expiry Tracker

**Changes to pages you already use:**

7. Sell Medicine: hidden cost & profit, sales filter, patient's past purchases
8. Sale Returns: shows what can still be returned
9. Purchase Returns: cash refund or deduct from what you owe
10. Stock Adjustments: damaged/expired stock now counts as a loss
11. Store Dashboard: Today / Weekly / Monthly / Custom buttons
12. Reports: new Profit section
13. Management Dashboard: new "Store Wastage & Refunds" card

**Fixes:**

14. Sales were saved with yesterday's date (fixed)

---

## 1. Supplier Payments

**Menu:** Medical Store → **Supplier payments**

**What it does:** Shows how much money you owe each supplier, and lets you record when you pay them.

**How the "You owe" amount is worked out:**

> You owe = what you bought − what you paid − returns taken off your bill

**Example:**

- On Monday you buy medicines worth **PKR 50,000** from *MediPak Distributors* (on the Purchase page, as usual).
- The Supplier Payments page now shows: **You owe MediPak PKR 50,000**.
- On Friday you pay them **PKR 30,000** in cash. You pick MediPak, type 30000, choose "Cash", pick Friday's date, and click **Record Payment**.
- Now it shows: **You owe MediPak PKR 20,000**.

**Good to know:**

- Every payment is also added to **Expenses** automatically (as "Supplier Payment"), because it's money leaving the hospital.
- You can pick the **date you actually paid**, even if you enter it later. Future dates are not allowed.
- If you pay more than you owe, it shows as an **advance** (money the supplier owes you).
- **Important:** your past purchases have no payments recorded yet, so right now it looks like you owe for all of them. If you already paid those suppliers, enter those payments with the real dates they were paid.

---

## 2. Reorder List

**Menu:** Medical Store → **Reorder list**

**What it does:** Shows the medicines that are running low, and how much to order.

**When does a medicine appear here?** When its stock is at or below its **Low Stock** level (set in the Medicine Catalog). Expired stock is not counted, because you can't sell it.

**How much to order?** The list suggests enough to bring the stock back up to **twice** the Low Stock level.

**Example:**

- Panadol's Low Stock level is **50 strips**.
- You have **20 strips** left.
- Suggested order = (50 × 2) − 20 = **80 strips**.
- Last time you bought Panadol from *khan* at **PKR 10 per strip**, so the estimated cost is **PKR 800**.

**Buttons:**

- **Print List**: prints a clean order sheet with a "✓" column to tick off each item as you order it.
- **Also show never-purchased medicines**: medicines you added to the catalog but have **never bought** are hidden by default (they always have 0 stock, so they would always look "low"). Click this when you want to order them for the first time. Click again to hide them.

**Good to know:** if a medicine has no Low Stock level set, the list says "Set a Low Stock level" instead of guessing a quantity.

---

## 3. Day Closing

**Menu:** Medical Store → **Day closing**

**What it does:** At the end of the day, it tells you how much cash **should** be in the counter drawer, and checks it against what you actually count.

> Cash that should be in the drawer = cash sales − cash refunds (for that day)

**Example:**

- Today you sold medicines for **PKR 12,000 in cash** (card and online payments are not in the drawer, so they're shown separately).
- A customer returned medicines and you gave back **PKR 500**.
- The drawer should have **PKR 11,500**.
- You count the drawer and find **PKR 11,400**. You type 11400 and click **Close Day**.
- The page shows: **Short by PKR 100**. You can add a note, e.g. "gave change wrongly".

**Good to know:**

- You can pick an earlier date to close a day you missed.
- If you close the same day again, it **updates** the earlier closing instead of making a second one.
- The **Past Closings** table lists every closed day with "Matches", "Short by …" or "Over by …".
- You can't close a day that hasn't started yet.

---

## 4. Stock Count

**Menu:** Medical Store → **Stock count**

**What it does:** You count what's really on the shelf, type the numbers in, and the system corrects its stock to match.

**Example:**

- The system says you have **90 strips** of Amoxil (batch AMX-A).
- You count the shelf and find only **85 strips**.
- You type **85** next to that batch. The page shows **−5** in red.
- You click **Save Count**. The stock becomes 85.
- The 5 missing strips cost you PKR 8 each, so **PKR 40** is recorded as **store wastage** (a loss) in Expenses.

**Good to know:**

- Leave a line **empty** if the shelf matches. Only lines with a difference are saved.
- If you find **more** than the system says, the stock goes up, but it is **not** counted as income.
- **Safety check:** if a sale happens while you are counting, the system notices and asks you to **Reload sheet** and recount that item, so a sale is never accidentally undone.
- Each correction appears on the Stock Adjustments page as "STOCK_COUNT" and in Stock History.

---

## 5. Stock History

**Menu:** Medical Store → **Stock history**

**What it does:** Pick any medicine and see **every** change to its stock: bought, sold, returned, damaged, counted. It shows who did it and when.

**Example:** Your system says Mebrazol has 40 strips, but you expected more. You open Stock History for Mebrazol and see:

| Date | What happened | Reference | Change | Before → After |
|---|---|---|---|---|
| 26 Sep, 10:19 pm | Removed (stock count) | STOCK COUNT | −50 | 90 → 40 |
| 26 Sep, 10:19 pm | Returned to supplier | PRET-20260926-0001 | −10 | 100 → 90 |
| 26 Sep, 10:19 pm | Purchased | PUR-20260926-0004 | +100 | 0 → 100 |

Now you know exactly where the stock went.

**Good to know:**

- Green numbers mean stock came **in**, red means stock went **out**.
- The **Reference** column shows the sale, purchase or return number, so you can find the paper slip.
- If a customer returns a medicine but it's kept aside (damaged, not put back for sale), it shows **0 (kept aside)**.

---

## 6. Expiry Tracker

**Menu:** Medical Store → **Expiry tracker**

**What it does:** Shows medicines that have expired or will expire soon, so you can act **before** they go to waste.

**Filter buttons:** Already expired · Within 30 days · Within 60 days · Within 90 days · All stock

**Cards at the top:**

- How many batches have **already expired**
- How many expire **within 30 days**
- **Value at risk**: what those batches cost you

**Example:**

- The tracker shows: *Amoxil 500mg, batch AMX-A, 3 days left, 496 pieces, value PKR 3,968, supplier MediPak*.
- You have two choices:
  - **Return to supplier**: opens the Purchase Returns page so you can send it back (if MediPak accepts returns). Pick MediPak there and enter the quantity.
  - **Write off**: removes all 496 pieces from stock and records **PKR 3,968** as store wastage. A confirmation box appears first, so you can't do it by accident.

---

## 7. Sell Medicine: what's new

### a) Hidden cost price and profit

Every time you click **Complete Sale**, the system quietly saves **what you paid the supplier** for each medicine sold.

**To see it:** in the **New Sale** table there is a **Cost / Margin** column, right after **Price**.

- Before you type a quantity, it shows what one unit cost you, e.g. *PKR 2 / piece*.
- After you type a quantity, it shows the line's cost and your profit, e.g.:

> Panadol · Price PKR 1000 · **Cost PKR 6** · *Margin PKR 2,994* · 3 piece · PKR 3000

If a line uses stock from two batches bought at different prices, the cost adds up both correctly.

The cost and margin are **never** shown in the popup after Complete Sale, and **never** printed on the customer's receipt.

### b) Recent Sales filter

The **Recent Sales** table has a dropdown: **All time / Today / Weekly / Monthly**.

*Example:* choose **Today** to see only today's sales when a customer asks about something they bought this morning.

### c) Patient's previous purchases

When you pick a **registered patient**, their last 10 medicine purchases appear under the search box.

*Example:* a regular patient says "give me the same medicine as last time". You can see it right there: "12 Sep · Panadol ×2, Amoxil ×10".

---

## 8. Sale Returns: shows what can still be returned

**Before:** if a customer returned part of a sale and came back later to return more, the page still showed the **full** quantity they originally bought. You could accidentally accept more than they bought.

**Now** the table shows three columns:

| Sold | Already returned | Returnable |
|---|---|---|
| 10 | 3 | **7** |

You can't type more than the "Returnable" amount. Once everything is returned, the box is disabled.

---

## 9. Purchase Returns: two ways to get your money back

When you return medicines to a supplier, you now choose **how** the supplier pays you back:

| Choice | What happens | Example |
|---|---|---|
| **Cash refund** | The supplier gives you money. It is added back to your cash. | You return 10 boxes worth PKR 1,000. The supplier hands you PKR 1,000 in cash. |
| **Deduct from what I owe** | No money changes hands. The amount is taken off your bill on the Supplier Payments page. | You owe the supplier PKR 20,000. You return PKR 1,000 of medicine. Now you owe PKR 19,000. |

The **Recent Returns** table shows which choice was used for each return.

---

## 10. Stock Adjustments: damaged or expired stock is now a loss

When you record stock as **Damage** or **Expired**, the money you paid for it is now recorded as a loss ("Medical Store Wastage") in **Expenses**.

*Example:* 20 strips of Panadol fall and get wet. You bought them at PKR 10 each. You record a Damage adjustment of 20 strips, and **PKR 200** is added to Expenses automatically.

The loss is counted at the **price you paid**, not the selling price, because that's the money you actually lost.

---

## 11. Store Dashboard: Today / Weekly / Monthly / Custom

The Store Dashboard now has the same period buttons as the other dashboards.

- The **Revenue** card follows the button you pick: "Revenue Today", "Revenue This Week", and so on.
- **Custom** lets you pick any start and end date.
- The stock cards (Low Stock, Expiring, Expired) always show **right now**, so they don't change with the buttons.

**Note:** the dashboard loads the last 12 months of sales. A custom range older than a year will show PKR 0 for the older part.

---

## 12. Reports: new Profit section

The Reports page (Medical Store → **Reports**) now has a **Profit** section under the main cards.

> Profit = what you sold medicines for − what you paid the supplier for them − discounts. Returned items are taken out.

**Example (a real month):**

| Sales (with known cost) | Cost of medicines sold | Profit | Profit margin |
|---|---|---|---|
| PKR 22,475 | PKR 11,976 | **PKR 10,499** | **46.7%** |

Below it, **Profit by Medicine** shows which medicines earn you the most.

**Good to know:** sales made **before** this feature was added don't have a saved cost price, so they are left out of the profit figures. The page tells you how many, e.g. "4 sold items (PKR 7,015) were sold before cost price was being saved".

The page also got the same card design and Today / Weekly / Monthly / Custom buttons as the other dashboards.

---

## 13. Management Dashboard: "Store Wastage & Refunds" card

A new card on the Management Dashboard shows the store's money gained or lost from:

- **Wastage** (damaged, expired or missing stock): money lost
- **Supplier cash refunds**: money gained

> Card amount = supplier cash refunds − wastage

*Example:* this week you lost PKR 1,200 to expired stock and got PKR 500 back in cash from a supplier. The card shows **−PKR 700** in red. If refunds were bigger than wastage, it would show in green.

These amounts are also included in **Total Expenses** and **Net Revenue** on the same dashboard.

---

## 14. Fix: new medicines no longer show "Low stock"

**The problem:** a medicine you just added to the catalog (and never bought) has 0 stock. 0 is below any Low Stock level, so it was marked **"Low stock"** and counted on the Store Dashboard.

**Now:** it shows a grey **"No stock yet"** badge in the Medicine Catalog, and it is left out of the Store Dashboard's Low Stock figures.

*Example:* you add **Raizek** with a Low Stock level of 100. Before you buy any, the catalog shows *No stock yet*. After you buy 500 through Purchase, it shows *OK*. When it later drops to 100 or below, it shows *Low stock*.

---

## 15. Fix: sales were saved with yesterday's date

**The problem:** because of a time-zone mistake, every medicine sale was saved with the **previous day's date**. For example, a sale made on 26 September was saved as 25 September. This made "Today" on the Reports page miss today's sales.

**The fix:** new sales now save the correct date, and all **9 old sales** were corrected. A full database backup was taken before the correction (in the `frontend/backups` folder).

---

## Where the money goes (summary)

| What you do | Effect on cash / expenses |
|---|---|
| Sell medicine | Money in (as before) |
| Customer returns medicine | Money out (refund) |
| Record Damage / Expired adjustment | Loss added to Expenses (at cost price) |
| Stock count finds stock missing | Loss added to Expenses (at cost price) |
| Stock count finds extra stock | Stock goes up; no income recorded |
| Pay a supplier | Added to Expenses |
| Purchase return: **Cash refund** | Money back in (reduces Expenses) |
| Purchase return: **Deduct from what I owe** | No cash change; lowers what you owe that supplier |

---

## Known issues

1. **"Return to supplier" on the Expiry Tracker** opens the Purchase Returns page, but you still need to pick the supplier yourself there.
2. **Database safety:** the database tables use an older MySQL storage type (MyISAM) that can't undo a half-finished save. For example, if something fails in the middle of recording a sale, part of it could still be saved. It has not caused a problem so far, but converting the tables to the newer type (InnoDB) is recommended.
