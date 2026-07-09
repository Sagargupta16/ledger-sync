# Comprehensive Hardening Plan (2026-07-04)

Feature-branch: `feat/comprehensive-hardening`.

Wave 1 research fanned out six specialist agents; this plan is the distilled action list. Original raw findings are archived at the top-level workflow output; only the merged action plan lives here.

## Wave 0 -- shipped in `0b9d950`

- FE AI key retrieval route corrected to match the BE `/api/preferences/ai-config/key` endpoint.
- BE `rates.py` prefix `/rates` -> `/api/rates`.
- BE `exchange_rates.py` prefix `/exchange-rates` -> `/api/exchange-rates` (also picks up `no-store` cache middleware).
- BE `stock_price.py` prefix `/stock-price` -> `/api/stock-price` (same reason).
- FE call sites in `services/api/preferences.ts` updated.
- `docs/API.md` reveal-key endpoint updated.

## Wave 2 -- structural fixes (this batch)

Ordered by dependency, not size. Each is its own commit.

### 2.1 Python version drift

- `pyproject.toml`: `requires-python >=3.11` -> `>=3.13`.
- `[tool.mypy]`: `python_version = "3.12"` -> `"3.13"`.
- `.github/workflows/migrate.yml`: `python-version: '3.14'` -> `'3.13'`.
- CI already runs 3.13. Ruff target already `py313`. This aligns all four.

### 2.2 Encryption-key split + HKDF (research finding S2/S3, bundled)

- New env `LEDGER_SYNC_ENCRYPTION_KEY` (min 32 bytes, optional -> falls back to `jwt_secret_key` with `logger.warning`).
- `core/encryption.py` rewrite:
  - Format v1 = current (no prefix, PBKDF2-100k, jwt_secret material).
  - Format v2 = new (`\x02` prefix, HKDF-SHA256, `encryption_key` material, `info=b'ledger-sync/byok-api-key/v2'`).
  - `decrypt_api_key` returns `tuple[str, bool]` where the bool is `needs_reencrypt`.
  - Callers (`preferences_ai.get_ai_key`, `ai_chat.bedrock_chat`) upgrade in-band.
- Rollout: deploy code, set env on Vercel, wait 30 days, remove v1 branch.
- Skip Argon2id / PBKDF2 bump -- the input IS a key, not a password (see research finding S3).

### 2.3 Refresh token rotation + `token_version`

- Alembic migration adds `users.token_version INT NOT NULL DEFAULT 0` (empty downgrade per repo convention).
- `db/_models/user.py` model gets the column.
- JWT payload gets `tv: int`, `iat: int`.
- `verify_token` accepts `expected_tv` kwarg; when set and mismatch -> return None.
- `get_current_user` in `deps.py` compares `payload.tv == user.token_version`.
- `logout`, `reset_account`, `delete_account` bump `token_version`.
- `refresh_tokens` uses `iat`-based reuse detection (reject refresh whose iat < user.last_refresh_iat).
- Soft-accept during rollout: legacy tokens without `tv` claim treated as tv=0 until `LEDGER_SYNC_JWT_STRICT_TV=true` flipped (day 8, after refresh TTL).

### 2.4 Per-authenticated-user rate limits

- Add `user_limiter` in `rate_limit.py` with a `key_func` that decodes the JWT `sub` claim, falling back to IP.
- Stack `@user_limiter.limit(...)` alongside existing `@limiter.limit(...)` on authenticated endpoints (`/api/upload`, `/api/ai/bedrock/chat`).
- No migration.

### 2.5 DB-level cascade backfill on user_id FKs

- Alembic migration adding `ondelete="CASCADE"` to the 19 user_id FKs currently ORM-only. Backfill via `op.drop_constraint` + `op.create_foreign_key` per column.
- Empty downgrade.

### 2.6 Robust anomaly detection

- Replace mean+stdev with median + MAD (Iglewicz-Hoaglin modified Z-score, cutoff 3.5) in `_detect_high_expense_months`.
- Add IQR fence fallback when MAD == 0.
- Rewrite `_detect_large_transactions` with 12-month rolling window + median + `MIN_HISTORY=5`.
- Recurring detection: median for expected_amount, MAD for variance.
- User-confirmed recurring patterns bypass min_confidence gate.
- Add `severity_score` column on Anomaly for cross-type ranking.
- Add stats_snapshot JSON on Anomaly for debug.

### 2.7 Tax detection regex expansion

- `\btax(es)?\b` -> `\b(tax(es)?|tds|gst|cess|surcharge|advance[\s-]?tax|self[\s-]?assessment)\b` in FY summary tax_paid detection.

### 2.8 Migrate.yml path trigger

- Add `backend/src/ledger_sync/db/_models/**` to `paths:` so schema changes actually trigger the migrate workflow.
- Align python-version with CI (3.13).

### 2.9 Delete broken Makefile

- References Poetry + black; project uses uv + ruff. Delete rather than rewrite -- uv commands are documented in CLAUDE.md.

### 2.10 Delete dead .github/renovate.json

- Two competing renovate configs. Root `renovate.json` (shared preset) is the live one; `.github/renovate.json` is dead.

## Wave 3 -- new features (research finding F1-F21)

Top-8 features that pass "power-user notices, self-hosted-cheap" bar. Others deferred.

Order:

1. **Transaction edit / delete / notes / tags** (F3) -- unblocks rules engine feedback loop and every reconciliation feature.
2. **Rules engine** (F1) -- Actual Budget-style IF-THEN.
3. **Transfer pairs auto-dedup** (F5).
4. **Sinking funds / true expenses** (F6) -- YNAB core methodology.
5. **80C / 80D / HRA headroom tracker** (F9) -- Indian-flavor differentiator.
6. **Runway metric** (F19) -- one number for the dashboard.
7. **Merchant/payee normalization** (F16) -- ships free once Rules Engine lands.
8. **Reconciliation snapshots** (F11) -- cornerstone of trust.

Deferred: AIS/26AS reconciliation (L effort, needs PDF parser -- promising but too big for this batch), advance tax scheduler (M, needs UI), custom dashboard widgets (M, react-grid-layout dep), custom report builder (L), retirement projector (M, overlaps with FIRE calc), refund detection (S, do later), category forecast (S, do later).

## Wave 4 -- stack upgrades (research finding S1-S27, all "S" effort)

Dependency order: patches first (safe), then behind-latest packages (medium), then one-off breaking change (bcrypt 5.0 last).

- **Patches**: alembic 1.18.4->.5, fastapi 0.138->.139, pytest 9.1.0->.1, framer-motion 12.42.0->.2, recharts 3.9.0->.2, vite 8.1.0->.3, tailwindcss 4.3.1->.2, PyJWT 2.12->2.13, openpyxl 3.1.0->.5, python-multipart 0.0.22->0.0.32, boto3 1.43.0->.40, httpx 0.28.0->.1, ruff 0.15.0->.20, pydantic 2.13.0->.4.
- **Behind**: pydantic-settings 2.2->2.14, typer 0.21->0.26, cryptography 48->49, pip-audit 2.7->2.10, rich 14->15, lucide-react 1.21->1.23.
- **Breaking**: bcrypt 4.0.1->5.0.0 (rejects >72-byte passwords with ValueError). Since we're OAuth-only, bcrypt is only used by (currently unused) `passwords.py`. Safe to bump; can also delete `passwords.py` in same commit since it's confirmed dead code.

Skip: pandas 3.0 (ecosystem not ready), everything already-current.

## Wave 5 -- docs, drift, hygiene

- HANDBOOK.md v2.17 -> current (add /overview page, Light theme mention).
- Page count reconciled everywhere (27 actual).
- DATABASE.md + DEVELOPMENT.md: "Define model in `db/models.py`" -> "Define model under `db/_models/`" (per new-migration skill).
- CLAUDE.md AI tool list refreshed (drop `get_savings_rate`, `get_top_merchants`, `get_transfer_flows`, `get_investment_holdings`; add `get_tax_summary`, `get_cash_flow`, `list_anomalies`, `get_preferences_summary`).
- Add `SECURITY.md` (report to sagargupta.online contact + rotation policy) + `CONTRIBUTING.md`.
- Fix duplicate `# CLAUDE.md` heading.
- Add `timeout-minutes: 20` to all workflow jobs.
- Delete dead endpoints (`meta.*` if unused, `analytics.wrapped`, `calculations.{insights, top-categories, daily-net-worth}` -- only if grep confirms no FE consumer).

## Wave 6 (post-merge, optional) -- AI tool + system-prompt hardening

From research finding A1-A25.

- Port `frontend/src/lib/tax-config/` + `taxCalculator.ts` to a Python `core/tax_engine.py` (single source of truth for both LLM tools and eventual server-side tax page).
- Add tools: `compare_tax_regimes`, `project_tax_liability`, `find_duplicate_subscriptions`, `get_subscription_summary`, `get_top_merchants`, `compare_periods`, `get_fire_projection`, `get_savings_rate_trend`, `compute_hra_exemption`, `get_dashboard_snapshot`.
- Update system prompt: FY vocabulary, tool preference order, refuse-to-hand-calculate, currency clarification.

---

*This plan is derived from six parallel research tracks completed 2026-07-04. Reference file: session transcript, task w9r2tm6m9.*
