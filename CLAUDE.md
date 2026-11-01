# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project Overview

Ledger Sync is a self-hosted personal finance workspace that turns Excel and CSV bank statements, Money Manager backups and CAS statements into 31 protected pages covering the ledger, analytics, investments, tax planning, commitments, goals, data health, and AI-assisted exploration. It supports multi-currency display with live exchange rates. Monorepo: Python FastAPI backend + React TypeScript frontend.

## Commands

### Development

```bash
# Install all dependencies (both backend and frontend)
pnpm run setup

# Run both backend and frontend concurrently
pnpm run dev
# Backend: http://localhost:8000 | Frontend: http://localhost:5173
# API docs (Swagger, development only): http://localhost:8000/docs

# Run services separately
pnpm run dev:backend    # uvicorn with --reload on port 8000
pnpm run dev:frontend   # vite dev server
```

### Per-stack commands

Both stacks are driven by `package.json` scripts -- read the `scripts` block in the
root `package.json` (setup/dev/lint/type-check/test/format/check, each with
`:backend` and `:frontend` variants) and in `frontend/package.json`. Backend tooling
is standard `uv run pytest|ruff|mypy` from `backend/`.

The two things those files do NOT tell you:

- `pnpm run check` is the gate before any feature is considered complete.
- `uv run alembic downgrade -1` only works on the revisions that implement a real
  reversal. The rest (most revisions since 2026-06) are marked `@irreversible`
  (`db/migrations/safety.py`) and raise `CommandError`; the migration env checks
  the whole rollback plan first, so nothing is applied. See
  [`docs/DATABASE.md`](docs/DATABASE.md) before relying on it.

## Architecture

### Monorepo Structure

Root `package.json` uses `concurrently` to coordinate both services. Backend uses uv for dependency management; frontend uses pnpm.

### Area rules (`.claude/rules/`)

Area-specific detail moved verbatim into path-scoped rules on 2026-10-31. Claude Code loads a rule when a session reads or edits a file matching its `paths:`; when a question needs one before any matching file is open, read the rule file directly.

| Rule | Loads for | Holds |
|------|-----------|-------|
| [`backend.md`](.claude/rules/backend.md) | `backend/**` | Backend layers (`api/`, `core/`, `ingest/`, `db/`, `schemas/`, `services/`, `config/`); data deduplication, analytics publication, execution boundaries, database, database-agnostic SQL, DB URL normalization and security patterns; new API endpoint and DB model recipes; local PostgreSQL needs pgvector |
| [`frontend.md`](.claude/rules/frontend.md) | `frontend/**`, root pnpm files, `.sonarcloud.properties` | Frontend directories; session boundaries, path alias, styling, API proxy, settings, PWA, installed-app orientation and mobile navigation patterns; two TypeScripts, `react-router` 8, Vitest 5 and `!important` gotchas; new page, hook and store recipes; import conventions; performance rules |
| [`frontend-ui.md`](.claude/rules/frontend-ui.md) | `frontend/src/**/*.tsx`, `*.css`, `components/**`, `constants/**` | Design System Constraints: colors, page scaffold, charts, layout, page filters, tables, Money, historical charts, themes, inline styles, mobile-first |
| [`shared-patterns.md`](.claude/rules/shared-patterns.md) | `backend/**`, `frontend/**`, `docs/CALCULATIONS.md` | Cross-stack patterns: auth flow, upload pipeline, server-side aggregation, capital losses and savings, goals |
| [`ai-chat.md`](.claude/rules/ai-chat.md) | AI chat, tools, MCP, canvas, AI settings and encryption files | AI Chatbot: modes, key preservation, transport, tool calling, system prompt, usage accounting; app-funded Bedrock deploy and AI rollout |
| [`deployment.md`](.claude/rules/deployment.md) | `.github/**`, `backend/vercel.json`, `backend/api/**`, `backend/pyproject.toml`, config, migrations, models, `docs/DEPLOYMENT.md` | Frontend and backend deploy mechanics (Vercel bundle limit, `cas` extra), Vercel config, Neon URL, OAuth redirect URIs, JWT secret, `feature_domains_2026`; CI pipeline |

### Key Patterns

- **Finance math is agreed before it is coded**: every tax, TDS, bonus, RSU, salary and projection formula and its owner function is in [docs/CALCULATIONS.md](docs/CALCULATIONS.md) ("Salary, RSU, and TDS Projections", "Tax Calculation"). Read it first, write any changed formula in plain text with a worked example for Sagar's sign-off before touching code, and never recompute salaried income that was actually received (2026-06-07: two TDS schedules coded first were wrong; tax, TDS and RSU math was re-derived in six sessions across Claude, Codex and Kiro before this was written down).
- **Tax rules**: `getStandardDeduction(fy, regime)` retains default-new compatibility. Old-regime deduction is INR 50,000; new-regime deduction is INR 75,000 from FY 2024-25. Comparisons, break-even, previous-year values, and effective-rate charts use the appropriate regime. The UI states income basis, deductions, fiscal-year rules, and any latest-known fallback.

### Deployment

Hosted service boundaries:

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | GitHub Pages | `sagargupta.online/ledger-sync/` |
| Backend | Vercel (serverless) | `ledger-sync-api.vercel.app` |
| Database | Neon PostgreSQL | PgBouncer pooler (Vercel integration) |

Deploy and CI mechanics: [`.claude/rules/deployment.md`](.claude/rules/deployment.md). App-funded Bedrock and AI rollout: [`.claude/rules/ai-chat.md`](.claude/rules/ai-chat.md). Full procedure: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Code Quality Rules

- Keep components/modules under 200 lines. If a file exceeds 250 lines, extract sub-components or hooks.
- One component per file (small styled wrappers co-located are fine).
- No `any` type -- use proper TypeScript types. Use `unknown` and narrow if unsure.
- No `console.log` in committed code. Use error boundaries or structured logging.
- Run `pnpm run check` before considering any feature complete.

## Toolchain Gotchas

- **This repo is CRLF** (`core.autocrlf=true`, no `.gitattributes`; ~75 of 80 sampled source files). `sed -i` and Python `read_text`/`write_text` both normalize to LF and produce a diff touching every line. Use the Edit tool. `backend/uv.lock` is legitimately LF at HEAD -- check a file's own baseline before "fixing" it.
- **A release bump must include `backend/src/ledger_sync/__init__.py`.** `/health` reports `ledger_sync.__version__`, and the Pages deploy waits up to ten minutes for it to equal `frontend/package.json`'s version, then fails and publishes nothing. 2.28.1 shipped with `__init__.py` still at 2.28.0, so its frontend never published (found 2026-10-20). Grep for the old version string, not the new one, and include `.py` files.
- **Git worktrees belong at the repo root, never under `frontend/`.** A nested worktree gives typescript-eslint two tsconfig roots and the pre-commit hook then fails repo-wide with zero real lint problems.
- **`backend/ledger_sync.db` is the LOCAL dev database, not production.** It holds real personal data and is gitignored: read-only SQL only, never commit it or anything derived from it, report shares and counts rather than balances or full account names. Production is Neon; its values differ from this file, so never present a local read as a prod fact.
- Frontend toolchain gotchas (two TypeScripts, `react-router` 8, Vitest 5 jest-dom types, `!important` only in `overrides.css`) are in [`frontend.md`](.claude/rules/frontend.md); local PostgreSQL pgvector is in [`backend.md`](.claude/rules/backend.md).

## Project Skills

The repo-specific skill set (atlas/craft/task skills under `.claude/skills/`) was untracked and removed from the working tree on 2026-07-03 (commit 594f102, "untrack AI assistant local files"). It no longer exists locally -- recover from git history at `594f102^` if ever needed. Until restored, workspace-level and user-level skills cover this repo.

## New Feature Patterns

- Page, hook and store recipes are in [`frontend.md`](.claude/rules/frontend.md); API endpoint and DB model recipes are in [`backend.md`](.claude/rules/backend.md).
- **New dependency**: Don't add new npm/pip packages without asking first. For transitive-dep security fixes, use `constraint-dependencies` in `pyproject.toml` (see `python-dotenv>=1.2.2` pattern), not a direct dep.

## Testing Expectations

- **Backend**: Unit tests for all `core/` logic. Integration tests for API endpoints. Use pytest fixtures.
- **Frontend**: Test hooks and utility functions. Simple render-only tests for components are unnecessary.

## Error Handling

- **Backend**: Raise `HTTPException` with proper status codes. Never return raw 500s.
- **Frontend**: `ChunkErrorBoundary` for lazy-loaded pages. TanStack Query handles API error states. Data-driven protected routes render `PageErrorState` before empty or zero-value states and wire retry to the failed queries.

## Database Rules

- All queries must be user-scoped -- always filter by `user_id`. Never expose cross-user data. The single exception is the admin stats (`core/admin_stats.py`, `admin_users.py`, `admin_app.py`; admins only): counts, sums and masked account emails, never a transaction, amount, name or full email.
- New tables require Alembic migrations. Never modify models without generating one.
- Use `query_helpers.py` for shared aggregation logic. Don't duplicate SQL.
- **Never use raw `func.strftime()`** -- it only works on SQLite. Use `fmt_year_month()`, `fmt_year()`, `fmt_month()`, `fmt_date()` from `query_helpers.py` for database-agnostic date formatting.
- Irreversible migrations fail closed instead of pretending to downgrade. Use the backup and forward-repair procedures in [`docs/DATABASE.md`](docs/DATABASE.md); verify dialect behavior with synthetic SQLite and native PostgreSQL databases.
- Hosted PostgreSQL can suspend while idle. Default connection timeout is 10s and statement timeout is 30s; confirm configured values when diagnosing a deployment.

## Knowledge Graph (graphify)

- `graphify-out/` holds a prebuilt code graph (gitignored). For architecture/relationship questions ("what calls X", "trace Y to the DB", impact of a change), query it before grepping: `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify affected "X"`.
- Treat the graph as a map and verify important claims against current source. Record refresh scope: local AST extraction can refresh code structure without a model call, while semantic document extraction may require a provider. Do not describe every `graphify update .` run as AST-only.
- Use the installed Graphify runtime and supported extract/merge APIs for a code-only refresh when requested; do not install dependencies or process `.env`, credentials, databases, or generated data. Preserve unrelated graph content and verify source hashes after extraction. If `graphify-out/` is missing, fall back to normal search unless a rebuild is requested.

The maintained system, import, OAuth, session, analytics, and AI diagrams are in
[`docs/architecture.md`](docs/architecture.md).
