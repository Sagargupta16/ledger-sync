# Deployment Guide

## Overview

Ledger Sync -- a self-hosted personal finance dashboard -- is deployed as three separate services, all on free tiers:

| Service | Platform | URL | Cost |
|---------|----------|-----|------|
| **Frontend** | GitHub Pages | `https://sagargupta.online/ledger-sync/` | Free |
| **Backend** | Vercel (serverless) | `https://ledger-sync-api.vercel.app` | Free |
| **Database** | Neon PostgreSQL 17 | Singapore region (Vercel integration) | Free (0.5 GB) |

The frontend auto-deploys on every push to `main` via GitHub Actions.
The backend auto-deploys on every push to `main` via Vercel's GitHub integration.

---

## Architecture

```
Browser (sagargupta.online/ledger-sync/)
   |
   |-- Static assets --> GitHub Pages (frontend/dist)
   |-- API calls ------> Vercel Serverless (FastAPI + Mangum)
                             |
                             +--> Neon PostgreSQL (Singapore)
```

- **Frontend** is a static React SPA served by GitHub Pages
- **Backend** is a Python FastAPI app wrapped with Mangum, running as a Vercel serverless function
- **Database** is managed PostgreSQL on Neon (free tier, auto-sleep after 5 min idle), connected via Vercel's Neon integration
- **CORS** is configured to allow requests from `sagargupta.online` and `sagargupta16.github.io`

---

## Current Deployment Setup

### 1. Neon PostgreSQL (Database)

**Dashboard:** [console.neon.tech](https://console.neon.tech) or Vercel dashboard > Storage tab

- **Project:** `neondb` (managed via Vercel Neon integration)
- **Region:** Asia Pacific (Singapore)
- **PostgreSQL version:** 17
- **Connection:** Pooler endpoint (PgBouncer)

The connection string is set as `LEDGER_SYNC_DATABASE_URL` in Vercel's environment variables.

> **Important:** Use the pooler connection string **without** `channel_binding=require` (PgBouncer doesn't support it). The URL should end with `?sslmode=require`.

**Alembic migrations** run automatically via GitHub Actions (`.github/workflows/migrate.yml`) when `backend/alembic/**` or `models.py` files change on push to `main`. The workflow can also be triggered manually via `workflow_dispatch`.

### 2. Vercel (Backend API)

**Dashboard:** [vercel.com](https://vercel.com) > ledger-sync-api project

The backend runs as a serverless function using the Mangum adapter to wrap FastAPI as an AWS Lambda-compatible handler.

**Key files:**
- `backend/vercel.json` - Routes all requests to the serverless handler
- `backend/api/index.py` - Entry point that wraps FastAPI with Mangum

Vercel auto-detects `uv.lock` and uses `uv` to install dependencies (falls back to `requirements.txt` if needed).

**Environment variables set in Vercel dashboard** (secrets):

| Variable | Required | Notes |
|----------|----------|-------|
| `LEDGER_SYNC_DATABASE_URL` | Yes | Neon pooler connection string (`postgresql://...?sslmode=require`). Do NOT include `channel_binding=require`. |
| `LEDGER_SYNC_JWT_SECRET_KEY` | Yes | Generate with `openssl rand -hex 32` (min 32 chars) |
| `LEDGER_SYNC_GOOGLE_CLIENT_ID` | For Google login | Google OAuth client ID |
| `LEDGER_SYNC_GOOGLE_CLIENT_SECRET` | For Google login | Google OAuth client secret |
| `LEDGER_SYNC_GITHUB_CLIENT_ID` | For GitHub login | GitHub OAuth client ID (create a **separate** prod app) |
| `LEDGER_SYNC_GITHUB_CLIENT_SECRET` | For GitHub login | GitHub OAuth client secret |
| `LEDGER_SYNC_FRONTEND_URL` | Yes | `https://sagargupta.online/ledger-sync` |
| `LEDGER_SYNC_CORS_ORIGINS` | Yes | JSON array of allowed origins |
| `LEDGER_SYNC_ENVIRONMENT` | Yes | `production` |
| `PYTHON_VERSION` | Yes | `3.12` |

The Neon integration also injects `NEON_DATABASE_URL`, `NEON_PGHOST`, and other `NEON_*` variables automatically.

**OAuth redirect URIs** (must be registered in provider consoles):
- Google: `https://yourdomain.com/ledger-sync/auth/callback/google`
- GitHub: `https://yourdomain.com/ledger-sync/auth/callback/github`

> **Note:** GitHub only allows one callback URL per OAuth app. Create separate apps for local dev and production.

### 3. GitHub Pages (Frontend)

**Workflow:** `.github/workflows/deploy-frontend.yml`

The workflow:
1. Checks out the repo
2. Installs pnpm dependencies
3. Builds with `GITHUB_PAGES=true` (sets `base: '/ledger-sync/'`)
4. Copies `index.html` to `404.html` (SPA routing fallback)
5. Deploys to GitHub Pages

**GitHub repo settings required:**

| Setting | Value |
|---------|-------|
| Settings > Pages > Source | GitHub Actions |
| Settings > Actions > Variables > `VITE_API_BASE_URL` | `https://ledger-sync-api.vercel.app` |

**Custom domain:** `sagargupta.online` is configured at the GitHub account level, so the app is served at `sagargupta.online/ledger-sync/`.

### SPA Routing on GitHub Pages

GitHub Pages doesn't natively support client-side routing. The workaround:

1. The build step copies `index.html` to `404.html`
2. When GitHub Pages can't find a file (e.g., `/ledger-sync/dashboard`), it serves `404.html`
3. React Router picks up the URL and renders the correct page
4. `BrowserRouter` has `basename={import.meta.env.BASE_URL}` to handle the `/ledger-sync/` prefix

---

## Database-Agnostic SQL

The codebase supports both SQLite (local dev) and PostgreSQL (production). Key difference:

- **SQLite** uses `strftime()` for date formatting in SQL
- **PostgreSQL** uses `to_char()` for date formatting

The `query_helpers.py` module provides database-agnostic helpers:

```python
from ledger_sync.core.query_helpers import fmt_year_month, fmt_year, fmt_month, fmt_date

# These automatically use strftime (SQLite) or to_char (PostgreSQL)
month_col = fmt_year_month(base.c.date).label("month")  # "YYYY-MM"
year_col = fmt_year(base.c.date).label("year")           # "YYYY"
```

**Always use these helpers** instead of `func.strftime()` directly.

---

## Local Development

Local development uses SQLite and runs both services on localhost:

```bash
# Install dependencies
pnpm run setup

# Start both backend and frontend
pnpm run dev
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:8000`, so no CORS configuration is needed locally.

---

## Deploying Changes

### Automatic (on push to `main`)

Both Vercel and GitHub Pages auto-deploy when you push to `main`:

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

- **Frontend:** GitHub Actions builds and deploys to Pages (~30 seconds)
- **Backend:** Vercel detects the push and redeploys (~20-40 seconds for serverless build)
- **Migrations:** If `backend/alembic/**` or `models.py` changed, GitHub Actions runs `alembic upgrade head`

### Manual Redeploy

- **Vercel:** Dashboard > Deployments > Redeploy
- **GitHub Pages:** Actions tab > Deploy Frontend workflow > Run workflow
- **Migrations:** Actions tab > Run Database Migrations workflow > Run workflow

---

## Environment Variables Reference

### Backend (Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LEDGER_SYNC_DATABASE_URL` | Yes | `sqlite:///./ledger_sync.db` | Database connection string |
| `LEDGER_SYNC_JWT_SECRET_KEY` | Yes (prod) | dev default | JWT signing secret (min 32 chars) |
| `LEDGER_SYNC_ENVIRONMENT` | No | `development` | `development`, `staging`, or `production` |
| `LEDGER_SYNC_CORS_ORIGINS` | No | See settings.py | JSON array of allowed origins |
| `LEDGER_SYNC_FRONTEND_URL` | Yes (prod) | `http://localhost:5173` | Frontend base URL for OAuth redirects |
| `LEDGER_SYNC_GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |
| `LEDGER_SYNC_GOOGLE_CLIENT_SECRET` | No | - | Google OAuth client secret |
| `LEDGER_SYNC_GITHUB_CLIENT_ID` | No | - | GitHub OAuth client ID |
| `LEDGER_SYNC_GITHUB_CLIENT_SECRET` | No | - | GitHub OAuth client secret |
| `LEDGER_SYNC_LOG_LEVEL` | No | `INFO` | Python log level |
| `PYTHON_VERSION` | Yes (Vercel) | - | Python version (e.g., `3.12`) |

### Frontend (GitHub Actions)

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_API_BASE_URL` | GitHub repo variable | Backend URL (`https://ledger-sync-api.vercel.app`) |
| `GITHUB_PAGES` | Set in workflow | Triggers `/ledger-sync/` base path |

---

## Troubleshooting

### Backend deployment fails on Vercel

1. Check **Vercel build logs** in the dashboard
2. Common issues:
   - `uv.lock` must be committed and in sync with `pyproject.toml`
   - `mangum` must be in `pyproject.toml` dependencies (Vercel uses `uv.lock`, not `requirements.txt`)
   - `vercel.json` must be in the `backend/` directory

### CORS errors in browser

1. Verify the origin domain is in `settings.cors_origins` or `LEDGER_SYNC_CORS_ORIGINS`
2. Check if the backend is returning 500 errors (CORS headers are missing on unhandled 500s)
3. Test CORS directly: `curl -I -H "Origin: https://sagargupta.online" https://ledger-sync-api.vercel.app/health`

### 500 errors on API endpoints

1. Check Vercel function logs (Dashboard > Deployments > Functions tab)
2. Common cause: SQLite-specific SQL (`func.strftime`) used instead of `fmt_year_month` helpers
3. Database connection issues: verify `LEDGER_SYNC_DATABASE_URL` is correct and uses the pooler URL

### Frontend 404 on refresh

1. Ensure `404.html` is copied from `index.html` in the deploy workflow
2. Ensure `BrowserRouter` has `basename={import.meta.env.BASE_URL}`
3. Ensure Vite `base` is set to `/ledger-sync/` for production builds

### Database migrations not running

1. Check that `.github/workflows/migrate.yml` is triggered (only runs when `backend/alembic/**` or `backend/src/ledger_sync/db/models.py` change)
2. Verify `LEDGER_SYNC_DATABASE_URL` GitHub Actions secret is set correctly
3. Use the workflow_dispatch trigger for manual runs

---

## Alternative Deployment Options

### Self-Hosted (VPS)

For an always-on deployment without cold starts:

1. Get a VPS (DigitalOcean, Linode, Oracle Cloud free tier)
2. Install Python 3.11+, Node.js 22+, Nginx
3. Clone the repo, install dependencies
4. Create a systemd service for the backend
5. Build the frontend and serve with Nginx
6. Use Let's Encrypt for SSL

See the systemd and Nginx configuration examples below.

<details>
<summary>Systemd service file</summary>

```ini
[Unit]
Description=Ledger Sync Backend
After=network.target

[Service]
Type=notify
User=deploy
WorkingDirectory=/home/deploy/ledger-sync/backend
ExecStart=uv run uvicorn ledger_sync.api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=10
Environment=LEDGER_SYNC_DATABASE_URL=postgresql://...
Environment=LEDGER_SYNC_JWT_SECRET_KEY=...
Environment=LEDGER_SYNC_ENVIRONMENT=production

[Install]
WantedBy=multi-user.target
```

</details>

<details>
<summary>Nginx configuration</summary>

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 100M;

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /home/deploy/ledger-sync/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

</details>

### Docker -- Alternative (not currently used in production)

<details>
<summary>Docker Compose setup</summary>

```yaml
version: "3.8"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      LEDGER_SYNC_DATABASE_URL: postgresql://user:pass@db:5432/ledger_sync
      LEDGER_SYNC_JWT_SECRET_KEY: your-secret-key
      LEDGER_SYNC_ENVIRONMENT: production
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  db:
    image: postgres:17
    environment:
      POSTGRES_DB: ledger_sync
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

</details>
