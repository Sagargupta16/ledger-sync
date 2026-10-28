# Ledger Sync Handbook

User guide for the current Ledger Sync workspace.

Checked against the frontend source on 2026-10-27. For exact routes and data sources, see [PAGES.md](PAGES.md). For formulas, see [CALCULATIONS.md](CALCULATIONS.md). For request contracts, see [API.md](API.md).

## Start Here

Open the public Home page and choose one of these paths:

- **Sign in** or **Get started free** opens the OAuth dialog.
- **Explore demo** opens a seeded sample workspace without an account.
- **Open workspace** or **Open dashboard** appears when already authenticated.
- **See capabilities** moves to the product capabilities section.

Google and GitHub buttons appear only when the backend reports those providers as configured.

Finish sign-in in the same browser tab where you started it. Attempts expire
after ten minutes and work once. If the callback says the attempt expired or
does not match, choose **Sign in again** to start a fresh attempt. **Return
home** leaves the recovery screen without signing in.

After a sign-in update, an older open tab may ask you to refresh and choose
Sign in again. The restart path begins a fresh attempt in the current app;
the previous code and state cannot be reused. A cached PWA shell may need
that refresh after its update.

If the dialog says it could not reach the sign-in service, use Try again once. If it keeps failing, check the backend and database health endpoints described in [DEPLOYMENT.md](DEPLOYMENT.md#sign-in-incident-runbook).

## Workspace Layout

### Desktop

The left sidebar contains:

- Dashboard, Overview, and Transactions at the top.
- Analytics, Wealth, Commitments, Planning, and Tax groups.
- A utility area with currency, theme, and motion controls, followed by Upload and Sync, Settings, and sign out.
- The current user profile at the bottom.

The global workspace header shows the current page and provides Search, Ask AI, and notifications when available.

### Phone

The bottom bar exposes:

- Dashboard
- Transactions
- Cash Flow
- More

More mirrors every remaining desktop group. The menu button also opens the full sidebar. Primary touch targets are at least 44px.

### Search

Use the sidebar Search control, the workspace header, or `Ctrl+K` to open the command palette.

### Themes

Settings and the sidebar theme control switch between Light and Dark. Before you choose, the app follows your operating system setting. Switching themes keeps the current page, filters, tabs, searches, and form values in place while charts redraw with the resolved palette.

### Motion

The sidebar motion control and Display Preferences switch between Full and Reduced motion. The choice is stored on this device and applies immediately without resetting the current page, filters, or form values.

### Data errors and recovery

Financial pages distinguish loading, empty, and failed requests. A failed request keeps the page title visible and shows Try again; it does not replace missing data with zero balances or an empty ledger. Settings uses the same recovery behavior for initial preference loading. Upload and Sync keeps file-specific parsing and upload failures beside the selected file so the exact operation can be retried.

## Recommended Workflow

1. Sign in with Google or GitHub.
2. Open Upload and Sync.
3. Review and confirm an Excel or CSV export containing your complete ledger.
4. Review Transactions, tags, and saved views.
5. Configure accounts, income buckets, expense categories, and investment mappings in Settings.
6. Use Dashboard and Overview for status.
7. Explore analytics, wealth, planning, and tax pages.
8. Ask the AI assistant targeted questions that it can answer through its read-only tools.

## Upload and Sync

**Route:** `/upload`

Supported files:

- `.xlsx`
- `.xls`
- `.csv`
- `.mmbak`, a Money Manager (Realbyte) backup; see [Money Manager backups](#money-manager-backups)

The source file is parsed in the browser. The browser maps flexible column names, validates rows, and computes a SHA-256 file hash. Only structured transaction rows and file metadata are sent to the backend.

Expected row fields:

- Date
- Account
- Category
- Subcategory, optional
- Type
- Amount
- Note, optional
- Currency, optional and defaults to INR; other source currencies are rejected

Supported transaction types are Income, Expense, Transfer-In, and Transfer-Out.

After selection:

1. The page parses and validates the complete file.
2. Review the source row counts, date range, currency, and accounts.
3. Confirm that this export contains your complete ledger, including all dates and accounts you want to retain.
4. The backend validates every row and saves reconciliation and import history together.
5. Analytics refresh separately, and the workspace reloads affected data.

This is a full snapshot replacement. Existing rows missing from the selected
file are soft-deleted, even if they belong to another account or an earlier
date. Use a complete export instead of a statement containing only a new month.
An invalid row rejects the batch before ledger changes.

An already imported file produces a conflict prompt. Force Reupload returns
to review and still requires confirmation of the complete snapshot.

If the ledger is saved but analytics fail, use **Retry insights refresh** to refresh
insights without uploading again. If the upload times out, check Import History
before retrying because the save may already have completed.

Import history below the upload area lists the most recent runs with local-time
timestamps and processed, new, updated, and already-present row counts. It is
account-scoped and is hidden in demo mode, where no server-side imports occur.

The review summarizes the selected snapshot; it is not a row editor or
column-remapping screen. The table below the drop zone remains an
expected-format example, not imported data.

Category suggestions. When the selected file has rows with a placeholder
category (Other, Miscellaneous, Uncategorised, Unknown and similar, with no real
subcategory under it), the review lists them, most confident first, each with up
to two suggested categories and how likely each is. Suggestions come from your
own saved income and expense rows that already have a category: the note's
words, the account, the amount's size and the weekday. They start once the saved
ledger has 30 categorized rows and at least 2 categories within income or within
expense, appear only when the best guess is at least 50% likely, and never
change the import. Transfers get no suggestions. To keep a suggestion, change
the row in your source app before exporting, or add a rule under Settings,
Categorization Rules; rules run on every import.

### Money Manager backups

Money Manager exports a `.mmbak` backup (More > Backup). Drop it on the Upload
page like a spreadsheet. The browser compresses it and the server reads it, so
nothing is parsed on the phone. Before anything is saved, the review shows the
backup's transactions, transfers, accounts and date range, and what the import
would add, update and remove. For a backup with repeat rules or budgets, the
review also says how many of each are new, changed, unchanged or kept as you
edited them, and how many are not imported and why.

A backup carries more than an Excel export:

- Every transaction keeps its Money Manager ID. When you later change an
  amount, date, account, note or category in Money Manager, the next backup
  updates that transaction in place instead of replacing it, so its history
  in Ledger Sync stays attached.
- Times of day, card statement and payment days, and which account pays each
  card are saved. An account you have not classified yet takes the type its
  Money Manager group implies (Credit Cards, Bank Accounts and so on).
- Repeat rules become scheduled payments with their next due date. A rule that
  repeats on a day of the month keeps that day; a month-end rule is due on the
  last day of each month. A rule whose amount you type each time in Money
  Manager takes the amount of its latest transaction. Rules that repeat between
  your own accounts (transfers) and rules that have already ended are not
  imported.
- Monthly budgets on a whole category become budgets with their default amount,
  or this month's override when Money Manager has one. Yearly budgets, budgets
  on a subcategory, and account or total budgets are not imported: a budget here
  is one monthly limit, measured against the whole category.
- Uploading the same backup again reports that the ledger is already up to
  date.

Like a spreadsheet, a backup is a complete snapshot: transactions missing from
it are removed. If one would remove more than 5% of your ledger, the import
waits for you to confirm it on this page.

Imported repeat rules and budgets follow Money Manager. A change there updates
them with the next backup, and one deleted there is turned off. Once you change
an imported budget or schedule in Ledger Sync, later backups leave it as you set
it. A budget you create in Ledger Sync is never changed, and a Money Manager
budget for a category that already has one is skipped. A budget you delete in
Ledger Sync comes back with the next backup while Money Manager still has it;
pause it to keep it off. A backup imported before repeat rules and budgets were
supported reports Already up to date; choose Re-import anyway once to bring them
in.

### Automatic sync with an iOS Shortcut

If Files > Browse > iCloud Drive shows a Money Manager folder holding `.mmbak`
files, an iOS Shortcut can upload the newest one whenever Money Manager closes.

1. In Ledger Sync, open Settings > Advanced > Access Tokens, choose Money
   Manager upload, create a token named "iPhone Shortcut" and copy it. It is
   shown once. A Money Manager upload token can only upload backups; it cannot
   read your data.
2. On the iPhone, turn on Settings > Shortcuts > Advanced > Allow Sharing Large
   Amounts of Data.
3. Create a shortcut with these actions:
   1. **Wait** 10 seconds.
   2. **Get Contents of Folder**: iCloud Drive > Money Manager.
   3. **Filter Files**: File Extension is `mmbak`, sorted by Creation Date,
      Latest First, limit 1.
   4. **Make Archive**: format gzip (.gz).
   5. **Get Contents of URL**: `https://ledger-sync-api.vercel.app/api/upload/money-manager`,
      Method POST, headers `Authorization: Bearer <your token>` and
      `Content-Type: application/gzip`, Request Body File set to the archive.
   6. **Get Dictionary Value** `status` from the result, then **If** it has no
      value, **Show Notification** with the result. A successful upload
      returns `imported` or `unchanged` and stays silent.
4. Add triggers: App, Money Manager, Is Closed, Run Immediately; and a daily
   Time of Day run as a safety net. On iOS 27, add both triggers inside the
   shortcut and turn on Allow Running When Locked.

Without a visible Money Manager folder, turn on the shortcut's Show in Share
Sheet, replace actions 1 to 3 with Receive Files from Share Sheet, and run it
from Money Manager > More > Backup > Export. Revoke the token in Settings to
stop the automation at once. A Shortcut upload that would remove more than 5%
of the ledger is refused; upload that backup from the Upload page instead.

Name the shortcut Ledger Sync Backup. On an iPhone or iPad, the Sync from Money
Manager button on the Upload page runs it by that name (iOS may ask before
opening Shortcuts), and Import History refreshes when you return to Ledger
Sync. On other devices the button lists the share-sheet steps instead. The
button is disabled while an upload is running or a review is open.

## Transactions

**Route:** `/transactions`

The transaction ledger is server-paginated.

Columns:

- Date
- Type
- Category with subcategory and tags
- Account
- Amount
- Note
- Tag action

Filter by search text, category, subcategory, account, type, tags, dates, or amount range. Saved Views store reusable filter combinations. The pin beside a saved view adds it to the Dashboard Watchlist. Date and Amount are sortable. Export downloads the filtered result as CSV.

The Transactions page does not edit, split, or delete rows. Tags can be replaced from the row action, and the Review Queue changes the category of rows from the last 30 days.

### Smart search

Turn on **Smart search** next to the search box to find transactions by meaning, so "coffee" also finds a cafe whose note never says coffee. It is opt-in: the first time, choose **Build index**. The server then sends each transaction's note, category, subcategory and account (never amounts or dates) to Amazon Titan Text Embeddings V2 in batches of 64 and shows progress. You can keep using the page, or stop after the current batch.

Indexing and every smart search count toward your AI usage (Settings > AI Assistant). App Bedrock users spend the app's access within a daily token allowance set by the server (1,000,000 by default). Users with their own Bedrock key spend that key. Users whose AI mode is their own OpenAI or Anthropic key must choose App Bedrock or save a Bedrock key first. If smart search cannot run, for example because the server has no Bedrock credentials or a token budget is spent, the card or a notice says why, the search box matches words again, and **Try smart search again** retries.

New or edited transactions show as pending until you choose **Update index**. The page filters (type, category, account, tag, dates, amounts) still narrow smart results, and the date and amount headers re-sort them. The table shows up to 50 matches in relevance order, pagination is hidden, and Export CSV covers the regular search only. **Remove index** deletes every stored vector. In the demo, results are ranked by text similarity in the browser and nothing is sent anywhere.

## Dashboard

**Route:** `/dashboard`

Use Dashboard for the selected period's operating signals. Safe to spend, the Weekly recap and the Watchlist sit at the top, below the period filter, and do not follow it.

### Safe to spend

The card at the top of Dashboard shows how much you can spend until your next payday without touching money that is already promised, and the same amount per day. It is a computation aid, not financial advice.

Safe to spend is the balance of your Cash, Bank Accounts and Other Wallets accounts, less what you owe on credit cards and any overdrawn account, less the bills due before payday, less a reserve for later bills that your next three paychecks cannot cover. Divided by the days to payday, it is the daily allowance.

- Payday comes from Settings > Financial Settings. With payday 1, or no saved preferences, the cycle runs to the month end. The card says so when no payday is set, and suggests the day your main income usually arrives when that differs.
- Only classified accounts count. Unclassified accounts with a balance are left out, and the card says how many. A closed account's positive balance is not cash, but what a closed card or bank account still owes stays owed. An account named like a security or rent deposit is left out.
- Bills before payday are recurring commitments (confirmed, or seen within two intervals plus seven days) and active scheduled transactions, counted from the day after your newest imported transaction, or today if sooner. Money expected in before payday is never counted.
- A schedule and the commitment detected from the same bill count once, at the schedule's amount and dates. They pair when they are linked, or when they have the same type and cadence and share a name on the same account, on any account for a commitment you added by hand, or on any account when the amounts are within 15% of each other; or, on the same account, the same amount, day, category and subcategory.
- Transfers are never bills. A card payment settles dues already subtracted, a move between your own cash accounts stays in the pool, and SIPs and other transfers out are carried by the projection as each account's usual net transfers.
- Held for later bills looks three pay cycles past payday: each paycheck (a recurring income) pays that cycle's bills, a surplus carries forward, and the deepest shortfall is held back now. With no recurring income nothing is held back, and the card says so.
- A typical day is the median spend per day over the last 90 days, with no-spend days counted as zero and bills left out. The bar compares this cycle's spending, bills left out, with an even pace through the cycle, and says what you usually spend by this day.
- Balances are as fresh as your last import. When they are older than yesterday the card says so, and bills dated after the newest imported row are still subtracted. The figure moves to the new day at midnight India time.

Select **Show the 30-day balance projection** to see each cash, bank and wallet account's projected end-of-day balance. Each day adds the commitments and schedules due that day and the account's usual net transfers (the median of the last three whole months, spread over the days), and takes its share of your average daily spend over the last 90 days, big days included. Card charges are left out, because the card bill is one of the transfers. Enter an amount in **Warn me below (INR)** to flag the first day an account is projected to fall below it; without an amount, the warning is for a fall below zero only. That amount is kept on this device only, in whole rupees, for the signed-in account.

### Weekly recap

A recap of the last full Monday to Sunday week (India time) sits below Safe to spend. It compares spending with the average of up to four full weeks before it; weeks before your first transaction are left out, and realised losses you classified stay out of spending. It lists the five categories that moved most, counting only categories you spent on that week. It shows the net-worth change at book value (income minus every expense row) and the category that drove it. It lists recurring expense commitments due today and in the next seven days, using the same confirmed-or-recently-detected rule as the Bill Calendar (card statement dues stay on the Bill Calendar), plus open anomalies about that week's transactions or months, and the days to the payday set in Settings > Financial Settings. If your ledger stops before the week's Sunday, the card says the week may be incomplete.

**Explain** is optional. It sends only the recap figures (totals, dates, and category and commitment names, never transactions or anomaly descriptions) to your configured AI assistant and asks for a three-sentence summary. On App Bedrock it uses one of the shared daily messages; with your own key it uses your key. In demo mode Explain shows the usual sign-in message instead of running. The figures are book values, a computation aid, not financial advice.

### Watchlist

Pin a saved view to watch it on the Dashboard without making a budget. On Transactions, open Views and tap the pin next to a view (up to 8). Each tile shows this month so far (India time, day 1 through today) against the same days of last month, with the last six complete months as a faint background line. A view with a type filter measures that type (income or transfers); one without measures spending. With nothing pinned, the Watchlist offers last month's top three spending categories; one tap saves a view for that category and pins it. **Arrange** moves or unpins tiles. Tiles do not follow the Dashboard time filter. Figures sum each view's own transactions and are a computation aid, not financial advice. In demo mode the demo views are pinned and read-only.

### Ledger snapshot

Quick Insights include configurable items such as:

- Income, expenses, net savings, and savings rate.
- Net cashback.
- Average, median, and largest expense.
- Fixed commitments from active recurring expenses, confirmed or detected; habits such as a daily lunch are left out.
- Age of Money.
- Days of Buffering from classified liquid accounts.
- Weekend and weekday spending context.

Dashboard settings control which available items appear.

### Financial Health Score

The score summarizes spending, saving, borrowing, and planning signals. Treat it as a directional diagnostic, not a credit score or financial recommendation.

Age of Money, Days of Buffering, the investment-transfer panel and the Financial Health Score are worked out on the server from your recorded data, so the Dashboard opens without downloading your whole ledger. The Financial pulse section and the health panel label these figures as computation aids from your recorded data, not financial advice.

### Income and expense sources

A grouped bar panel compares income and spending for each complete month in the
selected period. The current in-progress month is excluded and named below the
chart so partial income is not compared with near-complete fixed costs.

The two source panels show the largest categories and group smaller slices into Other. Selecting a category opens the matching analysis page with that category applied.

When no transactions exist for the selected period, Dashboard shows a single upload prompt rather than empty widgets.

## Overview

**Route:** `/overview`

Overview is a fixed whole-picture summary:

- Income
- Spending
- Net Saved and savings rate
- Net Worth link
- Top income and spending sources
- Budgets at risk
- Active goal progress

Select any block to open the corresponding detail page. Overview is separate from both the public Home page and the configurable Dashboard.

## Analytics

### Expense Analysis

**Route:** `/spending`

Use this page to answer where spending went and how it changed.

It combines:

- Total and average spending.
- Largest expense and category count.
- Needs, Wants, and Savings context.
- Category and subcategory breakdown, as a treemap above the list. Tap or click a category to zoom into its subcategories, and use the breadcrumb (or Escape) to zoom out.
- Monthly trend.
- Multi-category and cohort analysis.

Category deep links keep the selected category visible until cleared, and open the treemap on that category.

The Savings card here is income minus expenses, scored against your Savings Goal
in Settings. The 50/30/20 rule on the Budgets page shows a Savings card too, but it counts only
money you moved into investment accounts and scores it against the Spending
Rule's Savings percentage. The two numbers answer different questions and will
not match; each card names its own definition and target.

### Income Analysis

**Route:** `/income`

Use this page to review income sources, monthly trend, primary-source share, and configured tax buckets. Selecting an income category filters the page to that source.

Income classification comes from Settings. Unclassified items should be resolved there before relying on tax planning.

### Cash Flow

**Route:** `/income-expense-flow`

The desktop Sankey follows money from income sources through total income into expense categories and savings. Phone layouts use a vertical summary instead of compressing the Sankey.

Small categories are grouped into Other so the visible flows reconcile with the headline totals.

### Comparison

**Route:** `/comparison`

Choose Month, Year, or FY, then select two independent periods. The page compares income, expenses, savings, savings rate, expense distribution, and category movement. The slope chart draws your top 10 expense categories from period A to period B: a rising line means you spent more, and the marker beside each end value shows how its rank moved.

There is no custom date-range comparison.

### Year in Review

**Route:** `/year-in-review`

Choose a calendar year or fiscal year.

The page includes:

- Total Spending
- Total Earning
- Savings Rate
- Daily Average
- Spending heatmap
- Monthly breakdown
- Day-of-week analysis
- Generated observations

The page does not currently include net-worth milestones, merchant growth, or category-growth rankings.

### AI Canvas

**Route:** `/ai-canvas`

Ask for a chart in plain words, such as "income vs spending by month this financial year", "top 8 spending categories since April", "how my income flowed into spending this year, as a sankey" or "insurance premiums per month for the last three years", and the assistant looks the numbers up with its read-only tools, then draws the chart. It can draw bars, stacked bars, a ranking, a line, an area or stacked area, bars with a line (for example spending with your savings rate), a pie or donut, a radar, a treemap, a sankey, a slope (each item between two periods), a scatter, a heatmap (for example categories by month) or a waterfall (for example income stepping down through each expense to what you saved). It picks the form that fits the data, and you can name one. It adds one or two sentences with the main takeaway. Ask again to change the type, period or breakdown; each answer draws a new chart, and a follow-up builds on what is already drawn.

You can also ask for projections and what-ifs, such as "a 10,000 monthly SIP at 12% for 15 years", "a 50 lakh home loan at 8.5% for 20 years, principal versus interest" or "what 1 lakh is worth after 10 years of 6% inflation". These are calculated in code, not estimated by the AI, and use your own amounts when you say "my". If you ask for outside figures, such as India's inflation or an index's returns, the assistant draws them from its general knowledge, rounds them and tells you to check them against the official source.

Every chart has a badge saying where its numbers came from: **Your data** (every value from your ledger), **Calculated** (computed from your data or by the calculator, with the assumptions under "How this was made") or **Estimate, not your data** (outside figures you asked for).

When you ask for something your ledger does not record directly, such as tax deductions, the assistant charts the closest categories you do have instead of refusing, labels the chart as a stand-in (for example rent as the HRA basis) and says which parts it could not find. It answers without a chart only when there are no rows at all for the period.

While it works, the place where the chart will appear shows each step in words ("Finding your categories", "Totalling expenses by month for Rent"), how many steps are done and the seconds so far. Stop stops waiting; a call already sent still counts toward today's AI usage. If a request fails, Try again sends it once more.

Each chart has a Chart and Table switch, so you can read the exact values, a few one-tap follow-ups (for example as a line chart, as a treemap or grouped by quarter), the request it came from, and "How this was made", which lists the look-ups and assumptions behind it. On a phone the composer and the latest reply come first, with the conversation behind a toggle; on a wide screen the conversation sits in a full-height column on the left with the composer at its foot, the newest chart spans the canvas and older charts fill the space below.

Values from your data come through the same tools the assistant uses in chat, and the chart shows exactly what the assistant passed. Each chart uses three or four AI calls against the app-mode daily allowance. The canvas keeps your 12 newest charts while the tab stays open; remove one with its close button or clear them all. The canvas is not available in demo mode.

## Wealth

### Net Worth Tracker

**Route:** `/net-worth`

Net Worth combines account classifications and transaction-derived balances.

It includes:

- Net worth
- Total assets
- Total liabilities
- Book-value trend
- Compound projection band, with the previous straight line kept beside it
- Milestone ladder
- Expandable account groups
- Credit-card health

Investment values are book-value estimates unless a connected balance or current value is available. The page is not a live brokerage valuation.

The projection compounds your saving, not market returns. Your average monthly saving grows each year at the measured growth of your yearly savings (the last up to three complete years; it needs 24 complete months and is held within plus or minus 15% a year) for the five years the chart draws, then stays at its fifth-year level. With no measurable growth it is the straight line. When it compounds, the previous straight line stays on the chart as a grey dashed line for comparison. The milestone ladder's estimated dates follow the same path. It is a computation aid, not financial advice.

### Trends and Forecasts

**Route:** `/forecasts`

Review filtered monthly income, expenses, savings, rolling context, daily savings progression, and monthly breakdowns. Historical charts stop at today.

### Investment Analytics

**Route:** `/investments/analytics`

Settings map accounts into four display categories:

- FD and Bonds
- Mutual Funds
- PPF and EPF
- Stocks

The page shows book-value contributions, portfolio asset count, recorded
investment P and L, the largest holding, an optional monthly target,
allocation, growth, and an account table. These are cost-basis figures. The page explains why portfolio
return and XIRR require market valuations that the imported statements do not
contain.

**Mutual funds from your CAS.** Import the original CAS PDF (a CAMS or KFintech Detailed or Summary CAS, or an NSDL or CDSL CAS) with its password. For CAMS and KFintech that is the password you chose when requesting it; for NSDL and CDSL it is your PAN in capitals. The server reads the PDF in memory for that one request, and neither the PDF nor the password is stored or logged; only folios, schemes, units and dated transactions are saved. Each scheme is valued at AMFI's latest NAV, checked at most once a day after 10:30 IST and falling back to the statement's own NAV, with cost, gain and XIRR (Excel's convention, on a 365-day year). XIRR needs a Detailed CAS that starts before your first purchase; a statement with an opening balance, a Summary CAS or a demat CAS shows a dash and a short reason. A new import replaces earlier holdings of the same kind (CAMS and KFintech, or NSDL and CDSL). MFCentral statements and re-printed or Save as PDF copies are refused with a message saying what to request. These figures are computation aids, not financial advice. Demo mode shows sample holdings and cannot import.

### Projections

**Route:** `/investments/sip-projection`

Adjust:

- Current portfolio value
- Monthly SIP
- Annual SIP step-up
- Expected return
- Projection period

The page combines detected contribution history with projected invested value
and growth. Enter a current market value to compute the historical Total
Return and XIRR tiles; without it, those tiles ask for a valuation. It also
includes PPF, EPF, and NPS calculators using configured instrument rates.

### Returns Analysis

**Route:** `/investments/returns`

Review realised investment income, booked costs, net investment P and L, event
counts, monthly cash flows, and book-value holdings. Dividends, interest, booked
profit or loss, and broker costs come from the ledger. CAGR and monthly ROI are
not inferred from salary or contributions; actual returns require market
valuations.

## Commitments

### Recurring

**Route:** `/subscriptions`

The page separates:

- Active confirmed commitments.
- Detected candidates awaiting confirmation.
- Inactive commitments.

You can confirm detected items, add one manually, change its cadence or amount, deactivate it, or delete it.

Tap an amount to change it in place; Enter saves and Escape cancels. On a detected commitment, the amount you set is kept beside the detected one: each refresh still updates the detected amount from your history but never replaces yours. Such an item shows an Edited chip and its detected amount, with Reset to go back to it. Setting the detected amount itself clears the edit. An item you added by hand has no detected amount, so its amount is always the one you typed. Amounts typed on this page are in INR, the currency the ledger stores, whatever the display currency. Changing a detected bill's amount also confirms it, and un-confirming a bill clears an amount you set. Totals, sorting, the Bill Calendar, reminders and Safe to spend use your amount.

### Bill Calendar

**Route:** `/bill-calendar`

Use the month grid to inspect upcoming, paid, missed, and variable recurring amounts. Dot size increases with the bill amount. Select a day to see its detail list.

Each credit card's due date also appears on the calendar, and a Card statements panel below it shows every card's cycle (see below). The four advance tax dates (15 June, 15 September, 15 December and 15 March) appear as orange Tax date markers. A marker carries no amount, stays outside the month's total and the next-bill pick, and opens the Income Tax page, where the amount is worked out. It shows even when nothing may be owed, because advance tax is due only when the tax left after TDS is INR 10,000 or more.

#### Card statements

A Money Manager backup import stores each credit card's settlement day, payment day and paying account. The Bill Calendar uses them in two places:

- Each card's due date is its own entry on the calendar: purple while unpaid, red once the due date passes without full payment, green when paid. Only the latest statement asks for money, and an unpaid one counts in the month's total at what is left to pay. A paid statement and the open cycle's spend so far stay on the calendar as markers outside the total. A statement that billed nothing, and an older statement that rolled into the latest bill, are left off.
- The Card statements panel below the calendar lists every card with its last statement period, what it billed, the due date and days to go, and whether payments since the statement covered it, with the date and whether the money came from the paying account. It also shows what the open cycle has spent. Four tiles show the total due on statements, the spend not yet billed, the next due date and the cash left after dues.

The rules follow Money Manager's. The settlement day starts a statement period: with day 15, a period runs from the 15th to the 14th of the next month, and the 14th is the statement date. The bill is due on the first payment day after the statement date. A day past a month's end falls on its last day, so day 31 is 28 February.

A statement bills what the card owed when it closed, like Money Manager's payable balance: an unpaid earlier balance is carried into it, and a payment made before the close lowers it. Payments after a close pay the oldest bill first. A statement counts as paid once those payments cover it to within INR 1. Overdue means not paid in full by the due date; the app does not know the minimum due.

Cash after dues is the paying account's balance today less the unpaid part of the latest statement of each card it pays. Cards from a spreadsheet import have no card days; they are listed with a note asking for a backup import. Closed cards are left out and named in a note. These figures are computation aids, not financial advice.

## Planning

### Budgets

**Route:** `/budgets`

The page has two parts: category budgets for the current month, then the 50/30/20 rule.

**Category budgets** are monthly spending limits for expense categories. Each row shows this month's spending against the limit, what is left or how far over it is, and the alert threshold as a tick on the bar. A row reads On track, Near limit (at or above its alert threshold), Over limit (Limit reached when spending equals the limit), or Paused. The band above the list totals the active budgets and counts the ones that need attention, the same count as the navigation badge.

- Add budget opens the same form as Settings > Financial Settings (Budget defaults). If the category already has a paused budget, saving resumes it with the new limit and threshold.
- The pencil edits the monthly limit and the alert threshold in place. Only changed fields are saved.
- Pause keeps the limit but stops tracking and alerts. Resume recounts this month's spending straight away. Paused budgets are listed separately.
- Delete asks for confirmation and removes only the budget. Transactions are unchanged.

Spending counts expense rows dated in the current calendar month (India time), leaving out categories you classified as capital losses and excluded accounts. It is counted each time the list loads, so a new import, or a budget you add or resume, shows at once.

In demo mode the list shows sample budgets tracked against the demo ledger. Every control stays visible; saving shows a demo-mode message instead.

**50/30/20 rule.** The three buckets are:

- Needs
- Wants
- Savings

Each card shows target, actual, delta, and score. Category averages are grouped below each bucket. Choose 3 months, 6 months, 1 year, 2 years, 5 years, All, FY, or Custom. The period picker sticks to the top of the page once you scroll to it and applies only to this part.

Targets and category rules come from Settings.

Savings on this page means the net change in your investment perimeter: money
moved into SIP, PPF, EPF, NPS, or stock accounts, minus what came back out.
Income that merely stayed in your bank appears as Unallocated, not as Savings.
The floor it is scored against is the Spending Rule's Savings percentage. The
Expense Analysis page scores income minus expenses against your Savings Goal
instead, so expect the two Savings figures to differ.

### Financial Goals

**Route:** `/goals`

Create Goal expands an inline form below the summary area. Each goal shows target, current progress, deadline, feasibility, and a savings projection based on average monthly savings.

Signed-in goal creation, editing, progress, allocation, and deletion are saved
to your account. Progress and allocations use the stored current amount.
Deletion requires confirmation, and a failed save keeps the form available
for retry.

In demo mode, these actions change only the current Goals page visit. Leaving
and reopening the page restores the sample goals.

If older browser-saved goal values are found, signed-in users can review them
beside the current account's saved values. Select the fields to recover and
confirm that they belong to this account before saving. The review warns when
values might belong to demo goals. Recovered progress replaces the current
amount with the selected browser value. You can keep the account's current
values instead. A goal previously hidden only in this browser stays visible
until you choose what to do; permanent deletion requires a separate
confirmation.

Recovery never applies older values automatically or changes the original
browser data. The app checks the current goal and browser values again before
saving. If they changed, review the updated comparison. A failed save keeps
the original data and your selections available for retry. Confirmed choices
are remembered for this account. If browser storage cannot remember a
successful choice, the app reports that separately from the saved change.

### FIRE Calculator

**Route:** `/fire-calculator`

The calculator supports Lean, Barista, Standard, and Fat variants.

Adjust:

- Safe withdrawal rate
- Real return
- Years to retirement
- Barista monthly income
- Inflation
- Expected nominal return
- Retirement duration

Ledger totals and monthly history seed starting values when available. Results are scenario estimates, not financial advice.

The page has three tabs: FIRE, Retirement and Monte Carlo. The FIRE and Retirement tabs use fixed rates. **Monte Carlo** asks a different question: will the money last? One tap runs 1,000, 5,000 or 10,000 seeded simulated lifetimes, from your age today to the end age. Your net worth is split into equity, debt and cash pots (investment accounts are equity unless mapped as PPF/EPF or fixed deposits, which count as debt; everything else, net of cards and loans, is cash), each with its own expected return and volatility, plus INR inflation that varies from year to year. A run fails in the first year the portfolio cannot pay that year's spending. The tab reports the success rate, the median balance at retirement and at the end age, the ages at which failing runs ran out, and a percentile fan (10th to 90th and 25th to 75th). The optional stress test, Equity falls as you retire, drops the equity pot once, by 10% to 60%, as retirement starts. The same inputs always give the same fan, and **New seed** draws another sample. Starting savings and spending come from your ledger, every assumption can be edited, and **Reset to my data and the defaults** restores them. Balances load when the tab opens, and the simulation runs on demand in a Web Worker so the page stays responsive. Results are computation aids built on your assumptions, not forecasts or financial advice.

### Anomaly Review

**Route:** `/anomalies`

Every analytics refresh runs these checks against your own history. Each card says what was found and what the check looks for. The page lists them in this order:

- **Possible Duplicate**: the same account, amount and note within 3 days, from a payee that does not usually repeat that fast.
- **Fee or Interest**: a late fee, finance charge or card interest, forex markup or card annual fee named in the category or note. Loan interest, a card used to pay for something else, and a waived, reversed or refunded charge are not flagged.
- **Missing Recurring**: a commitment you confirmed has no matching entry past its usual window, though the account has newer rows. Detected commitments you have not confirmed are not checked.
- **Budget Exceeded**: this month's spending in a budgeted category passed its limit.
- **Closed Account Activity**: a row dated after the account was marked closed. This check is always on.
- **Large Transfer**: far above what the account usually sends, over the last 12 months.
- **Unusual Category**: a category's month far above its typical month over the last year. A fixed amount that moves to a new level for good, such as a rent increase, is flagged in its first month only.
- **High Expense**: a month, or one expense, well above your own trailing 12-month baseline.

Each card offers two outcomes in the check's own words, such as Duplicate or Not a duplicate, and an optional note. With no note typed, the outcome you pick is saved as the note. For a missing entry, Still expected asks again when a later entry is missed too, and Ended or paid elsewhere stays quiet until an entry arrives and a later one goes missing. A card links to the page that owns the fix: commitments, budgets, closed accounts in Settings, or Spending on the category.

Open findings sort first, then by check in the order above, severity and month. Cards load 50 at a time. The chips under the totals count findings per check and filter the list (`/anomalies?type=fee_charge` opens one type), and a line totals what flagged fees and card interest cost. Include Reviewed shows reviewed and dismissed findings.

The Anomaly Detection panel turns each check on or off and sets the threshold, which also sets how far a category's month must sit above its typical month. It also sets auto-dismiss: with it on, a large expense that is an entry of a recurring pattern, or a category month explained by a bill on a longer-than-monthly schedule, is filed as dismissed with an Auto-dismissed note, and turning it off brings them back. Saving re-runs detection.

### Review Queue

**Route:** `/review`

Go through your newest income and expense rows one card at a time, newest first, from the last 30 days. Swipe right, tap Keep or press K when the category is right. Swipe left, tap Change or press C to pick another one. The category suggester's top picks come first when it is sure enough to offer any, then every category of the row's type, most used first, with search. Undo (U) takes back the last decision; press it again to go further back. A card the suggester is at least 50% sure is mislabelled says "Looks like" under its category.

The 30 days end on the day of your newest row, or on today when the ledger runs past today; a row dated after today joins the queue on its day. Transfers and rows in excluded accounts are not queued, because a transfer's category is built from its two accounts.

Keep only marks the row as reviewed: if the source later recategorizes it, the next import applies that. Change rewrites the row at once and keeps your category through every later import, spreadsheet or Money Manager backup, and the row keeps its public ID. Money Manager itself still shows the old category. Undo gives the row the category its latest import brought. A row the source turns into another type loses its fix and returns to the queue; one it turns into a transfer loses its fix and leaves review. Insights rebuild once, when you finish the queue or leave the page after a change. In demo mode the queue holds the newest 20 demo rows and decisions last only for the visit.

### Data Health

**Route:** `/data-health`

Data Health says how current the ledger is and what the importer did to it. It shows a freshness banner, the days since the newest transaction that you have not imported, the last import, the transactions stored and the date range covered, a timeline of covered days, and a list of issues with actions: analytics that are behind the last import (with a Recompute analytics action), placeholder notes, catch-all categories and future-dated rows. Realised investment losses can be classified here: a classified loss leaves every spending total and category ranking, but still reduces what you saved. The last import's row counts close the page.

#### Balance checks

In the Balance checks panel, open an account, pick the day, type the balance your bank or card app shows, and save. The ledger's running balance for that account at the end of the same day, that day's rows included, is compared with it. A difference of up to INR 1 counts as a match.

Each account has a dot:

- Green: the newest check matches and no rows are dated after it.
- Red: the newest check is off. The row says by how much.
- Yellow: the newest check matched, but rows are dated after it.
- Grey: no row or check for more than 30 days.
- Hollow: never checked.

Card dues and overdrafts are negative in the ledger. Switch on **Owed or overdrawn** before saving one; the form shows the signed amount it will save. If a check and the ledger agree once the sign is flipped, the check says so.

A second check on the same account and day replaces the first. **Edit** changes a check's day or amount, and **Delete** asks once before removing it. The ledger figure is never stored with a check. It is recomputed on every visit, so an import that fills in missing rows can turn a red dot green.

An open account also shows a month grid, one row per calendar year. Filled months have rows. Dashed months fall between the first and last row but have none. A dot marks a month with a check, green when it matched and red when it was off. The caption under the grid names the empty months.

Idle and closed accounts sit behind one toggle unless a check is off. Excluded accounts are not listed, but a transfer into one still counts against the account it left, because the bank saw the money go. Demo mode shows three sample checks and cannot save new ones.

#### Bank alerts from your iPhone (Shortcuts)

Ledger Sync can check that every spend your bank texts you about made it into Money Manager. Alerts never become ledger rows (the next full backup would delete a hand-added row). The Bank alerts not in your ledger panel lists the alerts no ledger row answers.

1. Open Settings > Advanced > Access Tokens, choose Bank alert inbox, create the token and copy it. It is shown once.
2. In Shortcuts, choose Automation, then New Automation, then Message.
   - Message Contains: `debited`. Add a second automation with `credited` for refunds, salary and card payments.
   - Sender: your bank's SMS sender, if iOS lets you pick it. Whether alphanumeric senders such as `AX-HDFCBK` can be picked or trigger the automation is not verified; Message Contains works on its own.
   - Let it run without asking. On iOS 27 turn on Privacy > Allow Running When Locked; on iOS 26 turn off Ask Before Running. Apple notes that individual actions may also need to be allowed to run automatically.
3. Add the action Get Contents of URL:
   - URL: `https://ledger-sync-api.vercel.app/api/ingest/text`
   - Method: POST
   - Headers: `Authorization` = `Bearer <your token>`
   - Request Body: JSON. Add a Text field `text` set to Shortcut Input (the message). In a per-bank automation you can add a Text field `sender` with the bank's sender code, for example `HDFCBK`.
4. Run it once by hand, or wait for the next alert, and choose Always Allow when Shortcuts asks about sending the data.
5. Reading the reply:
   - `"status": "created"` stored a new alert.
   - `"duplicate"` means this message was already stored, or another channel already sent the same payment's reference.
   - HTTP 422 means the text is not a completed debit or credit (an OTP, a promotion, a statement, a "will be debited" notice), and nothing was stored.
   - HTTP 401 means the token is wrong, revoked, or not a bank alert inbox token.
   - HTTP 429 means a limit was reached (30 alerts a minute and 500 a day per token, and 500 new alerts per account in any 24 hours).

Email instead of SMS: the Email trigger (Sender = the bank's alert address, Subject Contains = `debited`) watches the Apple Mail app only, not the Gmail app, and is not yet tested on a device. Use one channel per bank. An SMS and an email for the same payment fold into one alert only when both carry the same UPI or transaction reference. On Android, Google Play limits SMS access, so use a sideloaded SMS-to-URL forwarder that can POST the same JSON body with the Authorization header.

What is stored: the amount, debit or credit, the last four digits of the account or card, a payee label (long digit runs masked), the date, the bank, and SHA-256 hashes of the text and the reference. The message text and any balance it quotes are never stored.

How matching works: an alert is in the ledger when a live row has the same amount to the paisa, a date within 2 days either way, and a fitting side. A debit matches an Expense or a transfer out; a credit matches an Income or a transfer in. Each row answers one alert, so two equal spends need two rows, and alerts are paired so that as many as possible match, preferring the account the card or account digits point to. The app learns which account each last-four belongs to from unambiguous matches, and prefers accounts named after the alert's bank. A spend logged with a different amount (a split, a tip, a forex markup) shows as missing; ignore it. Bank SMS covers only the payments your bank texts you about, so treat this as a completeness check, not a statement. It is a computation aid, not financial advice.

The panel lists missing alerts newest first with the payee, Debit or Credit, date, bank and last four digits, an After last backup tag when the alert arrived after your latest import, and an **Ignore** button. Ignored alerts sit behind an Ignored disclosure, where **Restore** brings one back. Demo mode shows sample alerts and turns Ignore and Restore off.

## Tax

### Income Tax

**Route:** `/tax`

The page compares India's old and new tax regimes using the selected fiscal year and configured income classifications.

It includes:

- Recorded-income analysis.
- Deductions.
- Regime comparison and recommendation.
- Salary and RSU projection mode.
- Multi-year projections.
- Optional projected TDS schedule for the current FY.

Vested RSUs use their stored vest-date stock price converted at the exchange
rate published for the vest date when available. Gross quantity remains the tax
basis; an optional net quantity reports shares actually received after
sell-to-cover withholding. Upcoming vestings use the configured appreciation
assumption.

The estimate identifies its recorded-income or salary-projection basis,
deductions, and fiscal-year rules. The old-regime standard deduction is INR
50,000; the new-regime standard deduction is INR 75,000 from FY 2024-25.
Comparisons apply each regime's own deduction. If an exact year has no
configuration, the page identifies its latest-known-rules fallback.

Tax rules are versioned by fiscal year, but results remain estimates. Verify final filing values against official records.

**Saved deductions.** Old-regime deductions are saved for each tax year. Open **Enter your deductions to compare accurately**, type the amounts and select **Save deductions**. The comparison updates as you type, and the saved amounts come back on your next visit to that year. **Clear** removes the year's saved amounts. 80C, 80CCD(1B) and 24(b) show how much of their limit is left; 80D (its limit depends on ages the page does not ask) and HRA have no fixed limit here, so they show none.

**Tax Year 2026-27.** From Tax Year 2026-27 the page follows the Income-tax Act 2025, which replaced the 1961 Act on 1 April 2026 and calls the year a tax year. Deduction labels show the new section with the old one beside it, such as s.123 (old 80C), s.124(3) (old 80CCD(1B)), s.126 (old 80D) and s.22 (old 24(b)); hover a field for what it covers. HRA keeps its plain label, and its hover text names Schedule III. Tax Year 2026-27 uses the FY 2025-26 slabs, standard deduction and rebate, which Finance Act 2026 left unchanged, so no estimate moves. In demo mode the amounts are filled in from the sample ledger and cannot be saved.

**Withholding to date** shows the actual payroll TDS from an imported AIS for the selected year, beside the estimate, with a link to [AIS Import](#ais-import). Without an imported AIS it shows -- and a link to import one.

**Advance tax.** The Advance tax panel takes the page's tax for the selected year (income tax with surcharge and cess, without professional tax) and subtracts TDS and TCS. That field starts with the tax on salary alone (salary TDS, RSU perquisites included); type the Form 26AS or AIS total to replace it, and leave it blank to use the estimate again. When what remains is INR 10,000 or more, the panel lists the four cumulative instalments: 15 June 15%, 15 September 45%, 15 December 75% and 15 March 100%. Expense rows whose category or subcategory says Advance Tax count against the next due date on or after their date; payments made 16 to 31 March count for the year, but after the last instalment. Each date shows what is due, paid and short, a bar with the 12% (June) and 36% (September) safe-harbour tick, and estimated deferment interest (s.234C, or s.425 from Tax Year 2026-27). After the year ends it also estimates default interest (s.234B), assuming the balance is paid with the return by 31 July, or earlier when self-assessment rows in the ledger clear it. Not modelled: the relief for a shortfall caused by capital gains or dividends, presumptive income, and the exemption for resident seniors. The panel needs a fiscal year that starts in April and covers FY 2020-21 onward. It is a computation aid, not tax advice.

**Filing calendar.** Return, belated and revised dates for an individual with no business income and no audit, with the days left. For AY 2026-27 (FY 2025-26) they are 31 July 2026, 31 December 2026 and 31 March 2027, under the Income-tax Act 1961 as amended by Finance Act 2026 (a 12-month revision window, and the s.234I fee for a revision after 31 December). From Tax Year 2026-27 they are 31 July and 31 December of the following year, and 31 March a year after that (Income-tax Act 2025, s.263(1), (4) and (5), with the s.428(b) fee). When business or professional income is recorded, the calendar adjusts the date or adds a caveat, because that return can be due later. With RSU grants on file, a note explains that a resident holder of foreign assets must file a return even at zero tax and report them in Schedule FA. These are statutory dates that CBDT can extend; a computation aid, not tax advice.

### Indirect Tax (GST)

**Route:** `/tax/gst`

The GST page estimates indirect tax from categorized expenses and date-aware slab assumptions. Bank statements do not expose invoice tax components, so this is an approximation.

### Foreign Assets

**Route:** `/tax/foreign-assets`

For RSU shares of a foreign employer, this page builds the worksheet for Schedule FA (foreign assets) of an Indian return and checks the FAST-DS 2026 scheme. Each vest that has happened becomes a lot. Add your RSU grants and vest dates in Settings, under Income and Salary Structure; until a vest has happened the page shows an empty state.

- **Calendar year.** Schedule FA covers 1 January to 31 December, not the financial year; 2025 is AY 2026-27 under the Income-tax Act 1961. **Export CSV** downloads the worksheet.
- **Schedule FA** shows Table A3 (foreign equity interest) rows per lot: the initial value (the lot's tax value), peak and closing values from the stock's daily closes at the ECB rate of the day, dividends credited and sale proceeds. The CSV adds the figures behind each value.
- **Lot ledger** lists each lot with its cost per vest share, the shares still held and its initial value, plus a flag where a figure is an estimate, such as received units that are not entered yet or a stock split since the vest.
- **Sales and dividends** are entered from your broker statement. A sale links to the vest it sold from, a dividend to its stock, with the foreign tax withheld and an optional SBI TT buying rate for that entry; without a rate the ECB rate of the day is used. A record the worksheet cannot place (no vest linked, dated before its vest, no shares held that day) is listed with the reason and an action to link it.
- **FAST-DS 2026 check.** Values each lot held on 31 March 2026 at the higher of cost and that day's average high-low quote, and counts down to 31 December 2026. It is only relevant if an earlier return left the shares out of Schedule FA.

Every figure is a computation aid, not tax advice: confirm with a CA before filing. Demo mode shows a synthetic stock and is read-only.

### AIS Import

**Route:** `/tax/ais`

After a year ends, download your Annual Information Statement from the income tax portal (open AIS, choose the year, then Download and JSON) and open it here. The file is opened in this browser tab, with your PAN and date of birth as its password. They are never sent, saved or logged, and the statement itself never leaves the tab.

The page shows:

- TDS on salary (section 192), other TDS, interest and dividends for the year, and TCS as a note. Interest and dividends count each payer once: the larger of its SFT report and its TDS lines.
- **In the AIS, not in your ledger:** income lines no ledger credit accounts for, such as interest on a deposit that is never paid out.
- **In your ledger, not in the AIS:** salary, interest, dividend, rent and gain rows, plus rows you classified as taxable or investment income, that have no AIS line.
- Every TDS and TCS line, interest and dividends reported under SFT, securities and mutual fund transactions, the salary annexure, and tax payments, refunds and other information, each in a collapsed section.

**Save totals** stores only four numbers for the year: TDS on salary, other TDS, interest and dividends. The Income Tax page then shows the TDS on salary as actual payroll TDS in Withholding to date, beside its estimate. Saving a year again replaces its totals; Saved AIS totals lists and removes them. In demo mode the page opens a sample statement built from the demo ledger and saves nothing.

The decryption follows the reverse-engineered AIS utility scheme (ported from itr-agent), not a documented one, so a portal change can stop a file from opening, and the ledger matching is heuristic. Treat everything here as a computation aid, not tax advice.

## Settings

**Route:** `/settings`

Settings has 13 sections in four workflow groups.

### Money Setup

1. **Financial Settings** - fiscal year, budget targets, fixed expenses, tax preferences, TDS schedule, EPF treatment, savings and payday settings.
2. **Income and Salary Structure** - fiscal-year salary components, RSU grants and vestings, vest-date prices, net shares received, the tax value of each vest in rupees, and growth assumptions.

Financial Settings starts expanded; Income and Salary Structure starts collapsed.

Under each RSU grant, every saved vest that has happened shows **Tax value per vest (INR)**: the conversion that governs and the rupee difference from the ECB value. The employer's perquisite figure (Form 16 / 12BA or the payslip) governs when entered. Otherwise enter SBI's TT buying rate for the last day of the month before the vest month (r.115 of the Income-tax Rules 1962 for vests up to 31 March 2026, r.206/207 of the Income-tax Rules 2026 after) and the vest-date price per share (**Fetch close** reads the close). Without either, the vest is valued at the ECB rate, labelled an approximation. Edits save at once, separately from Save settings, and a new vest needs Save settings first. The panel links SBI's current rate card and an archive of past cards. If your display currency is not INR the ECB approximation is not shown, so enter the employer's figure or an SBI rate. These conversions feed the Foreign Assets page; the Income Tax estimate is unchanged and still values vests from the stored vest price. A computation aid, not tax advice.

### Categories and Classification

3. **Account Classifications** - assign accounts to Cash, Bank Accounts, Credit Cards, Investments, Loans/Lended, or Other Wallets.
4. **Expense Categories** - essential and fixed-expense classification.
5. **Income Classification** - taxable, investment return, non-taxable, and other income buckets. The section opens with an audit: any income category your transactions carry that sits in none of the four buckets is listed with its transaction count and amount, so the money never silently drops out of your taxable-income and cashback totals. Pick a bucket per row, or apply every keyword suggestion at once. Saved categories that match no transactions (usually a spelling left behind after a rename) are listed below and can be removed.
6. **Categorization Rules** - ordered note/account matching rules with optional retroactive application.
7. **Investment Mappings** - map investment accounts to the four analytics categories.

All five sections in this group start collapsed.

### Profile and Display

8. **Display Preferences** - number format, display currency, default range, earning start date, Light/Dark theme, and Full/Reduced motion.
9. **Notifications** - budget, anomaly, and upcoming-bill preferences, and alerts on your phone or browser (see below).
10. **Dashboard Widgets** - choose visible Quick Insights.
11. **AI Assistant** - app Bedrock or BYOK mode, provider/model/key, and token limits. App mode runs Claude Haiku 5.5.

These sections start collapsed.

#### Phone alerts

The toggles (Budget Alerts, Anomaly Alerts, Upcoming Bills) and Remind me decide what is sent. Save the page first, because alerts follow the saved choices.

To get alerts on a device:

1. iPhone or iPad (iOS 16.4 or later): open Ledger Sync in Safari, tap Share, then Add to Home Screen, and open it from the Home Screen icon. Android and desktop browsers skip this step.
2. In Settings > Notifications, tap **Turn on alerts on this device** and allow notifications.
3. Tap **Send a test**. A test alert should arrive within seconds.

Alerts arrive once a day, between about 8:30 and 9:30 IST, and only when something is new: a bill entering the window and again the day before it is due, a budget passing its alert threshold and again its limit, or a new unusual item. They show counts and timing, never amounts, because the lock screen shows them. Tapping one opens the Bill Calendar, Budgets or Anomaly Review. The app icon badge counts what is flagged; it updates when an alert arrives.

Remove a device in the list to stop its alerts; signing out removes the device you are on. Alerts can be on for up to 10 devices. If notifications are blocked, allow them in the device settings (iPhone: Settings > Notifications > Ledger Sync) and reload. Alerts stay off, and the panel says why, until the server has push alerts set up. The demo cannot turn alerts on.

### Advanced

12. **Advanced** - anomaly detection threshold, excluded accounts, closed accounts, credit-card limits, and other power-user controls.
13. **Access Tokens** - single-purpose tokens for an iPhone Shortcut, Claude Code and bank alerts.

Both sections start collapsed.

#### Access tokens

Pick a purpose, name the token and create it. The token is shown once, expires after 365 days and can be revoked at any time. Each purpose allows up to 5 active tokens, and creating or revoking applies at once, outside Save. The list doubles as the connected-clients list: purpose, created, last used, expires and Revoke for each token.

- **Money Manager upload**: an iPhone Shortcut posts backups (see [Automatic sync with an iOS Shortcut](#automatic-sync-with-an-ios-shortcut)). It can only upload, never read your data.
- **Claude MCP read access**: lets Claude Code read your ledger with the assistant's read-only tools. Copy the one-line command from the dialog and run it in a terminal: `claude mcp add --transport http ledger-sync <API>/mcp --header "Authorization: Bearer <token>"`. It cannot change anything. What Claude reads goes to your own Claude account, and tax, savings and net-worth figures are computation aids, not tax or financial advice. claude.ai web connectors need an OAuth sign-in that Ledger Sync does not provide, so only clients that can send an Authorization header, such as Claude Code, can connect.
- **Bank alert inbox**: an automation forwards bank alert texts (see [Bank alerts from your iPhone](#bank-alerts-from-your-iphone-shortcuts)). It can only add alerts, never read your ledger.

The Save button is a solid blue action with a Save icon and activates only when staged settings changed. Reset restores preference defaults but preserves account classifications.

Save waits for the affected sections before reloading settings. If a section
fails, the draft stays available for retry; another section may already have
saved successfully. Changing accounts or signing out clears the previous
account's data and page drafts. Theme and motion remain device preferences.

## AI Assistant

The assistant is available from the workspace header or floating chat control when configured.

It can use 19 read-only tools for:

- Custom breakdowns and histories (any category, account or type by month, quarter, fiscal year or year, over any range)
- Accounts
- Transactions
- Monthly summaries
- Categories and category spending
- Net worth, and net worth over time
- Investment holdings (mutual funds from your CAS, investment accounts)
- Recurring items
- Goals
- Fiscal-year summaries
- Budgets
- Cash flow
- Tax summary, and every fiscal year's income, deductions and tax paid
- Preference summary
- Anomalies

The prompt contains currency, date, fiscal-year, and tool guidance. The assistant fetches actual numbers through tools in the same reply instead of saying it will, and states when no data is found. A follow-up question builds on the look-ups behind its earlier answers, which stay in the conversation it reads even though the transcript shows only the replies.

OpenAI and Anthropic BYOK calls go directly from the browser to the selected
provider with your key. Bedrock calls pass through the backend. A usable
personal Bedrock bearer key uses your funding and selected model; app mode
uses the app's model and shared allowance. Incomplete Bedrock BYOK settings
stop the request. Add a personal key or explicitly select App Bedrock mode.

App mode runs Claude Haiku 5.5. Claude 5.x models think by default, and the
Bedrock proxy cannot carry that reasoning from one tool round to the next, so it
turns thinking off on Haiku 5.5, Sonnet 5 and Opus 5, and asks Sonnet 5.5,
Opus 5.5 and Fable for low effort. Claude Haiku 5.5 is also preselected when you
pick AWS Bedrock with your own key. The Bedrock model list uses `us.` model IDs,
which work from US regions; from other regions pick Custom and paste the model's
`global.` ID.

When the provider stays the same, leave the key field blank to save only a
model or region change using the stored key. Changing provider requires a new
key. A conflicting save offers **Reload saved configuration** and keeps your
draft. App mode preserves your personal configuration for a later switch back.

The shared allowance counts model requests, including follow-up tool rounds,
so one question can use more than one unit. The server owner can list accounts
with no daily allowance in `LEDGER_SYNC_AI_UNLIMITED_EMAILS` or
`LEDGER_SYNC_ADMIN_EMAILS`; for them the chat shows today's count instead of
what is left. Bedrock reserves token budget
before a request and settles recorded usage afterward. An uncertain provider
failure can continue to count against the budget. Browser-direct usage
tracking does not replace spending limits at your provider.

Token budgets are available in both app and BYOK modes. Zero blocks Bedrock
calls; a blank field removes that personal cap. Pending reserved tokens are
shown separately and still count against the budget.

Tool results sent back to the model can contain your financial data. The tools
are read-only and scoped to your account. The Weekly recap's Explain button
counts as one chat message. Smart search counts toward your token budgets, not
the message count. Claude Code can use the same read-only tools outside the app,
plus a helper that returns today's date, with a Claude MCP read access token
(see Access tokens under Settings).

### Admin

**Route:** `/admin`, for the server owner only.

An account whose email the server lists in `LEDGER_SYNC_ADMIN_EMAILS` sees an
Owner section with Admin at the end of the sidebar, and an Admin tile on More.
The page shows:

- **Accounts:** how many there are, how many were active recently (a sign-in,
  an import or an AI call), sign-ups per month and which sign-in each uses.
- **Ledger:** live ledger rows by type, and imports per day.
- **AI:** calls today and over 30 days with their estimated spend in US
  dollars, per day, by funding and by model.
- **Server:** the version, database and migration, how many accounts use each
  feature, and table sizes.
- **Account list:** up to 200 accounts with masked emails (for example
  `sg8***@gmail.com`) and their counts of transactions, imports and AI calls.

It never shows any account's transactions, amounts, names or full emails.
Everyone else, and demo mode, sees an explanation instead. An admin account
also has no app-mode daily AI allowance.

## Demo Mode

Demo mode seeds deterministic sample transactions and analytics in the browser.

- Supported analysis reads use generated data.
- Server mutations are blocked with a sign-in explanation.
- Goals can be edited locally for the current page visit.
- Review Queue decisions last for the current page visit.
- Demo state lasts for the browser session.
- Exiting demo cancels pending work and clears the seeded query cache and user stores.
- Sign-in can contact the authentication service while demo mode is active.

## Time and Currency

The shared analytics filter provides All Time, FY, Yearly, and Monthly modes on supported pages. Year in Review provides only FY and Yearly.

Changing display currency changes formatting and converted display values. It does not rewrite imported ledger rows.

New imports require INR source amounts. Display conversion does not make a
foreign-currency statement a valid INR ledger snapshot.

## Current Limitations

- No direct bank synchronization.
- No PDF bank statement import. A mutual fund CAS PDF imports on Investment Analytics.
- No transaction split, delete, or edit UI beyond Review Queue category fixes.
- No invoice-level GST extraction.
- No live mutual-fund NAV feed. Holdings imported from a CAS use AMFI's NAV, checked at most once a day.
- Imported ledger cost-basis data does not provide a live portfolio valuation; only CAS holdings carry market value.
