---
name: debug-finance
description: Use when debugging a wrong number, missing data, or unexpected analytics output in this project. Walks the project's specific failure modes (V1 vs V2 staleness, user_id scoping miss, raw strftime in production, FY off-by-one for Indian April-March, decimal/float mixup, Pydantic-TS drift, empty downgrade rollback impossibility). Trigger when user says "this number is wrong", "chart shows zero", "values look off", "fy24 vs fy25 mismatch", "transfers showing as expense", or any finance-specific debugging question that goes beyond a generic stack trace.
---

# Debugging finance-specific bugs in ledger-sync

## The mental model

Most "wrong number" bugs in this codebase fit one of seven failure modes. Walk them in order — the cheap checks are first.

## 1. Stale V2 analytics (most common)

The dashboard reads pre-aggregated tables (`monthly_summaries`, `daily_summaries`, etc.) that get rebuilt on upload. If a user does anything that changes transactions outside the upload path (manual edit, settings change that affects classification), V2 doesn't refresh automatically.

**Quick check:**
```sql
SELECT MAX(updated_at) FROM monthly_summaries WHERE user_id = ?;
SELECT MAX(updated_at) FROM transactions WHERE user_id = ?;
```
If transactions are newer than summaries, V2 is stale.

**Fix:** call `POST /api/analytics/v2/refresh` for the user, or reproduce by re-uploading.

**Architecture pointer:** uploads now run analytics inline ([api/upload.py:80-94](backend/src/ledger_sync/api/upload.py#L80-L94)). If a feature mutates transactions outside upload, it should call `AnalyticsEngine.run_full_analytics()` itself.

## 2. user_id scoping miss

Multi-tenancy is enforced query-by-query. A `WHERE user_id = ?` filter omitted means the user sees aggregates from across all users — which on a single-deployment app looks like "weirdly inflated numbers".

**Quick check:** read the offending router/service. Every `select(Model).where(...)` for a user-data table must have `Model.user_id == current_user.id`. Integration test [test_analytics_user_scoping.py](backend/tests/integration/test_analytics_user_scoping.py) catches this if you run it locally.

**Fix:** add the filter. There is no good reason to omit it.

## 3. SQLite-only date functions in production

`func.strftime()` works on SQLite (dev) and silently breaks on Postgres (prod). The endpoint will throw or return zero rows.

**Quick check:**
```bash
grep -rn "func.strftime\|func\.date\|func\.julianday" backend/src/ledger_sync/
```
Anything outside [core/query_helpers.py](backend/src/ledger_sync/core/query_helpers.py) is a production-breaking bug.

**Fix:** replace with `query_helpers.fmt_year_month(col)`, `fmt_year(col)`, `fmt_month(col)`, `fmt_date(col)` — these compile to `strftime` on SQLite and `to_char` on Postgres.

## 4. Indian fiscal year off-by-one (April-March)

This codebase defaults to Indian FY: **April 1 to March 31**. So January 2026 belongs to FY 2025-26 (which started April 2025), not FY 2025-26 in the calendar-year sense.

**Quick check:** look for `fiscal_year_start_month` references and `fy_summaries`. The right helper is in [core/analytics/base.py](backend/src/ledger_sync/core/analytics/base.py) — if a calculation is doing `date.year` directly, it's calendar-year, not fiscal.

**Fix:** use `fy_year = date.year if date.month >= fy_start_month else date.year - 1` or call into the existing helper.

**Frontend equivalent:** [frontend/src/lib/taxCalculator.ts](frontend/src/lib/taxCalculator.ts) `getFYFromDate()` and `parseFYStartYear()`.

## 5. Decimal vs float vs string

Backend uses `Decimal` for amounts. Pydantic v2 serializes `Decimal` as **string** by default. If the frontend reads it as `number`, math silently produces `NaN`.

**Quick check:** open browser devtools, inspect the raw JSON response. If amounts are `"1234.56"` (string), the frontend must `parseFloat` or `Number()` them. If they're `1234.56` (number), the backend explicitly converted (some routers use `_decimal()` helper that returns `float`).

**Fix:** standardize at the boundary. The codebase mostly uses `_decimal()` to return `float` from API layer. Stick with that.

## 6. Pydantic-TypeScript drift

Backend renamed a field, frontend kept the old name. UI reads `undefined`. See [.claude/skills/schema-drift-check/SKILL.md](.claude/skills/schema-drift-check/SKILL.md).

**Quick check:** browser devtools network tab — does the response have the field the UI is reading? If not, drift.

**Fix:** update the TypeScript type to match the response.

## 7. Investment-account classification

This used to ship with the maintainer's personal account names as defaults; **as of 2.10.0 the defaults are empty**. Users configure their own mappings via Settings → Account Classifications. If a user's investment chart is empty, they probably haven't configured mappings.

**Quick check:** read `user_preferences.investment_account_mappings`. If it's `{}`, that's why investment dashboards are blank.

**Fix:** UI nudge — point user to Settings.

## Debug workflow

1. **Reproduce the bug** with a known data set (the demo dataset is good for this).
2. **Identify the layer:** wrong in DB? wrong in API response? wrong in UI?
   - DB: `sqlite3` or `psql` and run the actual query
   - API: `curl` with a JWT, inspect raw JSON
   - UI: browser devtools network tab + React DevTools
3. **Walk the seven failure modes** in order — most bugs hit one or two of them.
4. **Check git log** — was this code recently changed? `git blame` the suspect line.
5. **If stuck, dispatch a subagent** with full context: the failing query, the expected vs actual, what you've tried.

## What NOT to do

- **Don't add `WHERE 1=1` style band-aids.** Find the root cause.
- **Don't lower a pytest assertion** to make a test pass — fix the underlying calculation.
- **Don't disable a column or chart** because the data is wrong — make the data right.
- **Don't add try/except around analytics code** to hide errors. The codebase deliberately surfaces analytics failures (see [api/upload.py:87-94](backend/src/ledger_sync/api/upload.py#L87-L94) — only that exact try/except is acceptable, because it gracefully degrades upload after the fact).

## Definition of done

- [ ] Identified which of the 7 failure modes (or new failure mode worth adding here)
- [ ] Reproduced the bug with a known data set
- [ ] Fix at the layer where it's wrong (don't band-aid downstream)
- [ ] Test added — pure-function test if math, integration test if scoping/cross-cutting
- [ ] If finding is reusable: PR adds it as failure mode #8 in this skill
