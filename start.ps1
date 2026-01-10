# Ledger Sync - Start Script
# This script starts both the backend API and frontend dev server

Write-Host "🚀 Starting Ledger Sync..." -ForegroundColor Cyan
Write-Host ""

# Check if Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python not found. Please install Python 3.11+" -ForegroundColor Red
    exit 1
}

# Check if Node is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green
Write-Host ""

# Check if backend dependencies are installed
Write-Host "🔍 Checking backend dependencies..." -ForegroundColor Yellow
Push-Location backend
try {
    python -c "import fastapi" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "📦 Installing backend dependencies..." -ForegroundColor Yellow
        pip install -r requirements.txt
    }
}
catch {
    Write-Host "📦 Installing backend dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}
Pop-Location

# Check if database is initialized
Write-Host "🔍 Checking database..." -ForegroundColor Yellow
if (-not (Test-Path "backend\ledger_sync.db")) {
    Write-Host "📊 Initializing database..." -ForegroundColor Yellow
    Push-Location backend
    alembic upgrade head
    Pop-Location
}

Write-Host ""
Write-Host "✅ Backend ready!" -ForegroundColor Green
Write-Host ""

# Check if frontend dependencies are installed
Write-Host "🔍 Checking frontend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "📦 Installing frontend dependencies (this may take a few minutes)..." -ForegroundColor Yellow
    Push-Location frontend
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "✅ Frontend ready!" -ForegroundColor Green
Write-Host ""

# Check if concurrently is installed
Write-Host "🔍 Checking concurrently..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing concurrently..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "🚀 Starting both backend and frontend..." -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ Ledger Sync is starting!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Frontend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔌 Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "📚 API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""

# Run concurrently to start both
npm run devnpm run dev
