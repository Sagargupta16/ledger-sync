# Contributing

Thanks for improving Ledger Sync. Keep changes focused and verify both stacks before opening a PR.

## Setup

```bash
pnpm install
pnpm run setup
pnpm run dev
```

Local services:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

Use `.env.example` as the template. Put backend values in `backend/.env` and frontend values in `frontend/.env.local`. Never commit real secrets or `.env` files.

## Checks

Run the full project check before submitting:

```bash
pnpm run check
pnpm run build
```

Backend-only:

```bash
cd backend
uv run ruff check .
uv run mypy src/
uv run pytest tests/ -v
```

Frontend-only:

```bash
cd frontend
pnpm run lint
pnpm run type-check
pnpm test
pnpm run build
```

## Pull Requests

- Keep changes surgical and tied to one problem.
- Use conventional commits such as `fix: update onboarding docs`.
- Include what changed, why, and the checks you ran.
- Do not include generated caches, local databases, `node_modules`, or secrets.
