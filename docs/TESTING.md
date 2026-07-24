# Testing Guide

Testing reference for Ledger Sync 2.22.0.

Verified on 2026-07-14:

| Suite | Tests | Files |
| --- | ---: | ---: |
| Backend pytest | 328 | 35 |
| Frontend Vitest | 287 | 23 |
| Total | 615 | 58 |

Backend files are split into 25 unit files and 10 integration files.

Counts are a point-in-time baseline, not a permanent assertion. Recalculate
them when adding or removing tests.

## Full Project Gate

From the repository root:

```bash
pnpm run check
pnpm run build
```

`check` runs lint, type checking, and tests for both stacks in parallel.
`build` then performs the production frontend compile and bundle.

On Windows PowerShell systems where script execution blocks the pnpm shim, use:

```powershell
pnpm.cmd run check
pnpm.cmd run build
```

Do not treat type checking alone as feature verification. For user-facing
changes, also run the application and exercise the affected workflow.

## Backend Suite

### Tooling

- pytest 9
- pytest-cov
- FastAPI `TestClient`
- SQLAlchemy SQLite fixtures
- `unittest.mock` and pytest `monkeypatch`

`pytest-mock` is not a project dependency.

### Layout

```text
backend/tests/
  conftest.py
  fixtures/
  unit/             25 test files
  integration/      10 test files
```

Unit coverage includes:

- AI chat, tools, usage, and pricing behavior
- Analytics helpers and robust anomaly detection
- Authentication and token-version revocation
- Cohort spending
- Core calculator and time filters
- Encryption v1 compatibility and v2 writes
- Exchange, instrument, and stock rate handling
- Hash generation and duplicate occurrences
- Income, investment holding, and quick-insight calculations
- Normalization and rules
- Recurring frequency bands
- Salary and upload schemas
- Per-user rate-limit keys

Integration coverage includes:

- Analytics user isolation
- Categorization rules
- Daily net-worth opening balances
- Reconciliation and soft deletion
- Saved views
- 50/30/20 spending-rule responses
- Tag replacement and user scoping
- Transaction facets
- Current-date time-range behavior
- Transfer pair reconciliation

### Commands

Run from `backend/`:

```bash
# Full suite
uv run python -m pytest tests/ -v

# Quiet full suite
uv run python -m pytest tests/ -q

# One file
uv run python -m pytest tests/unit/test_hash_id.py -v

# One test
uv run python -m pytest tests/unit/test_hash_id.py::test_hash_generation -v

# Last failures
uv run python -m pytest tests/ --lf

# Stop on first failure
uv run python -m pytest tests/ -x

# Coverage
uv run python -m pytest tests/ --cov=ledger_sync --cov-report=term-missing

# Collection count without execution
uv run python -m pytest tests/ --collect-only -q
```

The repository does not enforce a coverage percentage threshold. Coverage is a
diagnostic; behavioral risk determines what must be tested.

### Fixtures

`tests/conftest.py` provides:

- Shared in-memory SQLite setup
- A request-bound `TestClient`
- Two-user fixtures for isolation checks
- A replaceable current-user dependency
- A standard test user
- Sample transaction data

The request fixture uses a shared SQLite connection so the fixture and FastAPI
request thread observe the same database.

### Unit-test pattern

Use Arrange, Act, Assert and construct the smallest domain input that proves
the behavior.

```python
from decimal import Decimal

from ledger_sync.ingest.hash_id import TransactionHasher


def test_duplicate_occurrence_changes_transaction_id() -> None:
    hasher = TransactionHasher()

    first = hasher.generate_transaction_id(
        date=transaction_date,
        amount=Decimal("100.00"),
        account="Bank",
        note="Purchase",
        category="Food",
        subcategory="Groceries",
        tx_type="Expense",
        user_id=7,
        occurrence=0,
    )
    duplicate = hasher.generate_transaction_id(
        date=transaction_date,
        amount=Decimal("100.00"),
        account="Bank",
        note="Purchase",
        category="Food",
        subcategory="Groceries",
        tx_type="Expense",
        user_id=7,
        occurrence=1,
    )

    assert first != duplicate
```

Use explicit `user_id` values in reconciliation and query tests. A test that
does not prove ownership boundaries is insufficient for a user-scoped
endpoint.

### API integration pattern

Override dependencies through FastAPI and assert both status and database
state.

```python
def test_saved_views_are_user_scoped(two_user_client) -> None:
    client, _session, user_a, user_b, current = two_user_client

    current["user"] = user_a
    created = client.post(
        "/api/saved-views",
        json={"name": "Large food", "filters": {"category": "Food"}},
    )
    assert created.status_code == 200

    current["user"] = user_b
    assert client.get("/api/saved-views").json() == []
```

For each authenticated endpoint, cover:

- Success
- Validation failure
- Missing resource
- Cross-user isolation
- Mutation persistence
- Idempotency where promised

### Backend static gates

Run from `backend/`:

```bash
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
```

## Frontend Suite

### Tooling

- Vitest 4
- jsdom
- React Testing Library
- `@testing-library/jest-dom`

The suite does not include Jest, Cypress, Playwright, or
`@testing-library/user-event` as test dependencies.

### Configuration

`frontend/vitest.config.ts` configures jsdom and the shared setup file:

```text
frontend/src/test/setup.ts
```

Test files are colocated under feature `__tests__/` directories.

Current coverage areas:

- Authentication modal and OAuth callback
- Shared data table and transaction filters
- Quick insights
- Account-type constants
- Shared analytics time filter
- Chat provider adapters
- Date, file, formatting, and financial utilities
- FIRE, GST, instrument, projection, RSU, tax, TDS, and XIRR calculations
- Tax configuration fallback
- Mutual-fund expected value
- Net-worth projection

### Commands

Run from `frontend/`:

```bash
# Single run
pnpm test

# Verbose output
pnpm test -- --reporter=verbose

# One file
pnpm test -- src/lib/__tests__/taxCalculator.test.ts

# Name filter
pnpm test -- -t "calculates"

# Watch mode
pnpm run test:watch
```

The current package does not configure a coverage provider or UI-mode script.
Add the corresponding dependency and configuration before documenting or
using `--coverage` or `--ui`.

### Pure utility pattern

Financial calculations should remain pure so edge cases are cheap to test.

```typescript
import { describe, expect, it } from 'vitest'

import { computeFIRENumber } from '@/lib/fireCalculator'

describe('computeFIRENumber', () => {
  it('uses the configured safe withdrawal rate', () => {
    expect(computeFIRENumber(600000, 0.03)).toBe(20000000)
  })

  it('returns zero for an invalid withdrawal rate', () => {
    expect(computeFIRENumber(600000, 0)).toBe(0)
  })
})
```

### Component pattern

Prefer visible behavior and accessible roles over component internals.

```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Example', () => {
  it('shows the empty state', () => {
    render(<Example items={[]} />)

    expect(screen.getByRole('heading', { name: 'No items yet' })).toBeInTheDocument()
  })
})
```

Use the real shared providers when behavior depends on the router, query
client, theme, or authentication store. Reset persisted Zustand state between
tests that mutate it.

### Frontend static and build gates

Run from `frontend/`:

```bash
pnpm run lint
pnpm run type-check
pnpm run build
```

## End-to-End and Browser Verification

There is no committed automated E2E suite. Do not claim Cypress or Playwright
coverage.

For a release or broad UI change, run both services and manually or
programmatically verify:

- Public Home at desktop and phone widths
- Sign-in provider loading, retry, focus trap, and callback error
- Demo entry
- Dashboard and Overview
- Transaction filters, tags, saved views, pagination, and mobile cards
- Upload parse, conflict, force reupload, result summary, and cache refresh
- Representative analytics, wealth, planning, and tax pages
- Settings save and reset behavior
- Light, dark, and system themes
- Sidebar, More page, bottom navigation, safe areas, and no overlap
- 404 and lazy-chunk failure states

Backend smoke checks:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/db
curl http://localhost:8000/openapi.json
```

An authenticated workflow is required to verify financial endpoints. Do not
put a real token into committed scripts or documentation.

## Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`.

### Frontend job

Uses the shared Node workflow with `working-directory: frontend`. It installs
dependencies, lints, builds, and runs Vitest.

### Backend job

Uses Python 3.13, sets `PYTHONPATH=src`, and runs:

```bash
uv sync --locked --no-build --no-install-project --all-extras --group dev
uv run --no-sync --locked --no-build ruff check src/ tests/
uv run --no-sync --locked --no-build ruff format --check src/ tests/
uv run --no-sync --locked --no-build mypy src/
uv run --no-sync --locked --no-build pytest tests/ -q
```

### Security job

Uses the shared security-scan workflow with read access to contents and write
access for security events.

CI uses a concurrency group and cancels an older run when a newer commit is
pushed to the same pull request.

## Test Selection by Change

| Change | Minimum verification |
| --- | --- |
| Pure frontend calculator | Focused Vitest file, frontend lint, type check |
| Shared frontend primitive | Related component tests, full frontend suite, production build, responsive browser check |
| Backend pure function | Focused unit file, Ruff, mypy |
| API contract | Unit validation plus integration endpoint test and OpenAPI inspection |
| User-owned data mutation | Integration success, persistence, validation, and cross-user isolation |
| Reconciliation or analytics | Focused tests plus full backend suite |
| Migration or model | Migration review, upgrade on disposable database, backend suite |
| Auth, encryption, or rate limits | Focused security tests plus full backend suite and live workflow |
| Cross-stack feature | Full root check, build, and browser workflow |

## Debugging Failures

Backend:

```bash
uv run python -m pytest tests/ -vv --tb=long
uv run python -m pytest tests/ --pdb
```

Frontend:

```bash
pnpm run test:watch
pnpm test -- --reporter=verbose
```

When a failure is environment-specific, record:

- Exact command
- Operating system and runtime versions
- First failing assertion or stack frame
- Whether the focused test passes alone
- Whether state, time, timezone, or concurrency changes the result

## Related Reading

- [Development](DEVELOPMENT.md)
- [Architecture](architecture.md)
- [API](API.md)
- [Contributing](../CONTRIBUTING.md)
