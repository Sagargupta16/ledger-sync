# Deployment Guide

## Overview

This guide covers deploying Ledger Sync to various environments and platforms.

## Pre-Deployment Checklist

- [ ] All tests passing (`poetry run pytest`, `pnpm test`)
- [ ] No TypeScript errors (`pnpm run type-check`)
- [ ] No linting errors (`pnpm run lint`, `poetry run ruff check .`)
- [ ] Environment variables configured
- [ ] Database backups created
- [ ] Git repository clean (all changes committed)
- [ ] Documentation updated
- [ ] Security review completed

## Development Environment

### Local Development (No Deployment Needed)

```bash
# Clone repo
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

# Setup
pnpm install
cd backend && poetry install --with dev && cd ..
cd frontend && pnpm install && cd ..

# Run
pnpm run dev
```

Accessible at http://localhost:3000

## Production Environment Deployment

### Option 1: Self-Hosted (VPS/Dedicated Server)

#### Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Python 3.11+
- Node.js 18+
- Nginx or Apache (reverse proxy)
- SSL certificate (Let's Encrypt)

#### Deployment Steps

1. **Connect to Server**

```bash
ssh user@server.com
```

2. **Install System Dependencies**

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs nginx
```

3. **Clone Repository**

```bash
cd /home/user
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync
```

4. **Setup Backend**

```bash
pip install poetry
cd backend
poetry install --with dev
poetry run alembic upgrade head
cd ..
```

5. **Build Frontend**

```bash
npm install -g pnpm
cd frontend
pnpm install
pnpm run build  # Creates dist/ folder
cd ..
```

6. **Create Systemd Service for Backend**

```bash
sudo tee /etc/systemd/system/ledger-sync-backend.service > /dev/null << EOF
[Unit]
Description=Ledger Sync Backend
After=network.target

[Service]
Type=notify
User=user
WorkingDirectory=/home/user/ledger-sync/backend
ExecStart=/usr/local/bin/poetry run uvicorn ledger_sync.api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

7. **Configure Nginx**

```bash
sudo tee /etc/nginx/sites-available/ledger-sync > /dev/null << EOF
upstream backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name yourdomain.com;

    # Redirect to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 100M;

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Frontend
    location / {
        root /home/user/ledger-sync/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
```

8. **Enable and Start Services**

```bash
sudo ln -s /etc/nginx/sites-available/ledger-sync /etc/nginx/sites-enabled/
sudo systemctl enable ledger-sync-backend
sudo systemctl start ledger-sync-backend
sudo systemctl restart nginx
```

9. **Setup SSL with Let's Encrypt**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com
```

10. **Monitor Logs**

```bash
sudo journalctl -u ledger-sync-backend -f
sudo tail -f /var/log/nginx/error.log
```

### Option 2: Docker Deployment

#### Dockerfile (Backend)

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies and Poetry
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*
RUN pip install poetry

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false && poetry install --without dev

# Copy application
COPY . .

# Run migrations
RUN alembic upgrade head

# Start server
CMD ["uvicorn", "ledger_sync.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### Dockerfile (Frontend)

```dockerfile
# frontend/Dockerfile
FROM node:22-alpine as build

WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Production image
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: sqlite:///ledger_sync.db
    volumes:
      - ./backend/ledger_sync.db:/app/ledger_sync.db
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      VITE_API_URL: http://backend:8000
    depends_on:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped
```

**Deploy with Docker Compose:**

```bash
docker-compose up -d
```

### Option 3: Heroku

#### Procfile

```
web: uvicorn ledger_sync.api.main:app --host 0.0.0.0 --port $PORT
```

#### Deploy

```bash
heroku login
heroku create ledger-sync
git push heroku main
heroku run alembic upgrade head
```

### Option 4: AWS

#### Using EC2

- Launch Ubuntu 20.04 LTS instance
- Follow self-hosted deployment steps above
- Use AWS RDS for PostgreSQL (optional)
- Use S3 for database backups

#### Using Elastic Beanstalk

```bash
eb init -p python-3.11 ledger-sync
eb create ledger-sync-env
eb deploy
```

### Option 5: Digital Ocean App Platform

1. Connect GitHub repository
2. Create app from `app.yaml`:

```yaml
name: ledger-sync
services:
  - name: backend
    github:
      repo: yourusername/ledger-sync
      branch: main
    build_command: pip install -r requirements.txt
    run_command: uvicorn ledger_sync.api.main:app --host 0.0.0.0
    http_port: 8000

  - name: frontend
    github:
      repo: yourusername/ledger-sync
      branch: main
    build_command: npm install && npm run build
    static_sites:
      - source_dir: dist
        routes:
          - path: /
```

## Environment Configuration

### Backend Environment Variables

```bash
# .env (backend)
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db
LEDGER_SYNC_LOG_LEVEL=INFO
```

### Frontend Environment Variables

```bash
# .env (frontend)
VITE_API_URL=https://yourdomain.com/api
```

## Database Management

### Backup Database

```bash
# Local backup
cp ledger_sync.db ledger_sync.db.backup

# Remote backup (scp)
scp user@server.com:/home/user/ledger-sync/backend/ledger_sync.db ./backup/

# Automated backups (cron job)
# Add to crontab: 0 2 * * * /home/user/backup-database.sh
```

### Restore Database

```bash
# Local restore
cp ledger_sync.db.backup ledger_sync.db

# Remote restore
scp ./backup/ledger_sync.db user@server.com:/home/user/ledger-sync/backend/
```

### Database Optimization

```bash
# Vacuum (optimize storage)
sqlite3 ledger_sync.db "VACUUM;"

# Analyze (update statistics)
sqlite3 ledger_sync.db "ANALYZE;"

# Integrity check
sqlite3 ledger_sync.db "PRAGMA integrity_check;"
```

## Performance Optimization

### Backend Optimization

1. **Caching**

   - Cache analytics queries (Redis)
   - Cache API responses

2. **Database**

   - Add database indexes
   - Use connection pooling

3. **Code**
   - Profile hot paths
   - Optimize algorithms
   - Use async operations

### Frontend Optimization

1. **Build Optimization**

   ```bash
   pnpm run build  # Creates optimized dist/
   ```

2. **Code Splitting**

   - Lazy load pages
   - Tree shake unused code

3. **CDN**
   - Use CDN for static assets
   - Cache busting with hashes

## Monitoring & Logging

### Backend Logging

```python
import logging
from logging.handlers import RotatingFileHandler

# Configure rotating file handler
handler = RotatingFileHandler(
    'ledger_sync.log',
    maxBytes=10485760,  # 10MB
    backupCount=10
)

logging.basicConfig(
    handlers=[handler],
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### Monitoring Tools

- **Prometheus** - Metrics collection
- **Grafana** - Metrics visualization
- **ELK Stack** - Log aggregation
- **Sentry** - Error tracking

## Security

### HTTPS/SSL

- Always use HTTPS in production
- Use Let's Encrypt for free certificates
- Keep certificates updated

### CORS

```python
# Configure CORS in FastAPI
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Environment Variables

- Never commit secrets to git
- Use `.env` files (add to `.gitignore`)
- Use environment variable vaults in production

### Input Validation

- Validate all API inputs
- Sanitize file uploads
- Use SQLAlchemy ORM (prevents SQL injection)

## Scaling

### Horizontal Scaling

1. **Multiple Backend Instances**

   - Use load balancer (Nginx, HAProxy)
   - Share database (PostgreSQL recommended)

2. **Database Scaling**
   - Migrate from SQLite to PostgreSQL
   - Setup replication for read-only replicas
   - Implement partitioning for large tables

### Vertical Scaling

1. **More Powerful Hardware**
   - Increase server RAM
   - More CPU cores
   - SSD storage

## CI/CD Pipeline

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          cd backend
          pip install poetry
          poetry install --with dev
          poetry run pytest tests/ -v

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        run: |
          ssh -i $DEPLOY_KEY user@server.com "cd ledger-sync && git pull && cd frontend && pnpm run build"
```

## Rollback Procedure

### If Deployment Fails

```bash
# Revert to previous version
git revert <commit-hash>
git push

# Or checkout previous tag
git checkout v1.0.0
git push --force
```

### Database Rollback

```bash
# If migrations failed
alembic downgrade -1

# Or to specific revision
alembic downgrade <revision>
```

## Monitoring Uptime

### Health Check

```bash
curl -I https://yourdomain.com/api/health
```

### Uptime Monitoring Services

- Uptime Robot (free)
- StatusPage
- Pingdom
- Datadog

## Disaster Recovery

### Backup Strategy

1. **Daily Backups**

   ```bash
   0 2 * * * /home/user/backup-database.sh
   ```

2. **Off-site Backups**

   - Upload to S3
   - Upload to cloud storage

3. **Recovery Testing**
   - Regularly test restores
   - Document procedures

### Disaster Recovery Plan

1. Database corrupted → Restore from backup
2. Server down → Use load balancer/failover
3. Full outage → Deploy to new server

## Troubleshooting Deployment

### Backend Not Starting

- Check Python version
- Verify dependencies installed
- Check database file permissions
- Review error logs

### Frontend Not Loading

- Check build completed (`pnpm run build`)
- Verify Nginx configuration
- Check browser console for errors
- Verify API URL in .env

### API Errors

- Check backend logs
- Verify database connectivity
- Check CORS configuration
- Test with curl:
  ```bash
  curl -H "Content-Type: application/json" https://yourdomain.com/api/transactions
  ```

## Post-Deployment

1. **Verify Functionality**

   - Test file upload
   - Check all pages load
   - Verify API endpoints work

2. **Monitor Logs**

   - Watch error logs for issues
   - Monitor performance metrics

3. **Database Optimization**

   - Run VACUUM
   - Run ANALYZE
   - Check integrity

4. **Backup Current State**
   - Backup database
   - Document configuration
