# Deployment Guide

## Overview

Ledger Sync is deployed as three separate services:

| Service | Platform | URL | Cost |
|---------|----------|-----|------|
| **Frontend** | GitHub Pages | `https://sagargupta.online/ledger-sync/` | Free |
| **Backend** | Render (free tier) | `https://ledger-sync.onrender.com` | Free |
| **Database** | Neon PostgreSQL | Singapore region | Free (0.5 GB) |

The frontend auto-deploys on every push to `main` via GitHub Actions.
The backend auto-deploys on every push to `main` via Render.

> **Note:** The Render free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30-50 seconds (cold start). Subsequent requests are fast.

---

## Architecture

```
Browser (sagargupta.online/ledger-sync/)
   |
   |-- Static assets --> GitHub Pages (frontend/dist)
   |-- API calls ------> Render (FastAPI backend)
                             |
                             +--> Neon PostgreSQL (Singapore)
```

- **Frontend** is a static React SPA served by GitHub Pages
- **Backend** is a Python FastAPI app running on Render
- **Database** is managed PostgreSQL on Neon (free tier, auto-sleep after 5 min idle)
- **CORS** is configured to allow requests from `sagargupta.online` and `sagargupta16.github.io`

---

## Current Deployment Setup

### 1. Neon PostgreSQL (Database)

**Dashboard:** [console.neon.tech](https://console.neon.tech)

- **Project:** `ledger-sync`
- **Region:** Asia Pacific (Singapore)
- **PostgreSQL version:** 17
- **Connection:** Pooler endpoint (PgBouncer)

The connection string is set as `LEDGER_SYNC_DATABASE_URL` in Render's environment variables.

> **Important:** Use the connection string **without** `channel_binding=require` (PgBouncer doesn't support it). The URL should end with `?sslmode=require`.

### 2. Render (Backend API)

**Dashboard:** [dashboard.render.com](https://dashboard.render.com)

**Service configuration:**

| Setting | Value |
|---------|-------|
| Runtime | Python |
| Root Directory | `backend` |
| Build Command | `pip install poetry && poetry install` |
| Start Command | `poetry run uvicorn ledger_sync.api.main:app --host 0.0.0.0 --port $PORT` |
| Health Check | `/health` |
| Auto-Deploy | Yes (on push to `main`) |

**Environment variables:**

| Variable | Value | Notes |
|----------|-------|-------|
| `PYTHON_VERSION` | `3.12.0` | Must include patch version |
| `LEDGER_SYNC_DATABASE_URL` | `postgresql://...@...neon.tech/neondb?sslmode=require` | Neon connection string |
| `LEDGER_SYNC_JWT_SECRET_KEY` | (random 64+ char string) | Generate with `openssl rand -hex 32` |
| `LEDGER_SYNC_ENVIRONMENT` | `production` | Enables production validation |
| `POETRY_VIRTUALENVS_CREATE` | `false` | Install into system Python |

A `render.yaml` blueprint is included in the repo root for reference, but the service was created manually.

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
| Settings > Actions > Variables > `VITE_API_BASE_URL` | `https://ledger-sync.onrender.com` |

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

Both Render and GitHub Pages auto-deploy when you push to `main`:

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

- **Frontend:** GitHub Actions builds and deploys to Pages (~30 seconds)
- **Backend:** Render detects the push and redeploys (~3-5 minutes for build + deploy)

### Manual Redeploy

- **Render:** Dashboard > Manual Deploy > Deploy latest commit
- **GitHub Pages:** Actions tab > Deploy Frontend workflow > Run workflow

---

## Environment Variables Reference

### Backend (Render)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LEDGER_SYNC_DATABASE_URL` | Yes | `sqlite:///./ledger_sync.db` | Database connection string |
| `LEDGER_SYNC_JWT_SECRET_KEY` | Yes (prod) | dev default | JWT signing secret (min 32 chars) |
| `LEDGER_SYNC_ENVIRONMENT` | No | `development` | `development`, `staging`, or `production` |
| `LEDGER_SYNC_CORS_ORIGINS` | No | See settings.py | JSON array of allowed origins |
| `LEDGER_SYNC_LOG_LEVEL` | No | `INFO` | Python log level |
| `PYTHON_VERSION` | Yes (Render) | - | Must be `X.Y.Z` format (e.g., `3.12.0`) |
| `POETRY_VIRTUALENVS_CREATE` | Yes (Render) | - | Set to `false` |

### Frontend (GitHub Actions)

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_API_BASE_URL` | GitHub repo variable | Backend URL (e.g., `https://ledger-sync.onrender.com`) |
| `GITHUB_PAGES` | Set in workflow | Triggers `/ledger-sync/` base path |

---

## Troubleshooting

### Backend won't start on Render

1. Check **Render logs** for the actual Python traceback
2. Common issues:
   - `PYTHON_VERSION` must be `X.Y.Z` (not just `3.12`)
   - `poetry.lock` must be committed and in sync with `pyproject.toml`
   - Missing dependencies (run `poetry lock` locally and push)

### CORS errors in browser

1. Verify the origin domain is in `settings.cors_origins` or `LEDGER_SYNC_CORS_ORIGINS`
2. Check if the backend is returning 500 errors (CORS headers are missing on unhandled 500s)
3. Test CORS directly: `curl -I -H "Origin: https://sagargupta.online" https://ledger-sync.onrender.com/health`

### 500 errors on API endpoints

1. Check Render logs for the error
2. Common cause: SQLite-specific SQL (`func.strftime`) used instead of `fmt_year_month` helpers
3. Database connection issues: verify `LEDGER_SYNC_DATABASE_URL` is correct

### Frontend 404 on refresh

1. Ensure `404.html` is copied from `index.html` in the deploy workflow
2. Ensure `BrowserRouter` has `basename={import.meta.env.BASE_URL}`
3. Ensure Vite `base` is set to `/ledger-sync/` for production builds

### Render cold starts (slow first load)

This is expected on the free tier. The service sleeps after 15 minutes of inactivity and takes ~30-50 seconds to wake up. Options:
- Accept it (it's free)
- Upgrade to Render paid tier ($7/month) for always-on
- Use a cron service to ping `/health` every 14 minutes (keeps it warm)

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
ExecStart=poetry run uvicorn ledger_sync.api.main:app --host 127.0.0.1 --port 8000
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

### Docker

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
