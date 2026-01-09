# Setup script for ledger-sync
# Run this after installing Poetry

Write-Host "🚀 Setting up ledger-sync..." -ForegroundColor Cyan

# Check if Poetry is installed
if (!(Get-Command poetry -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Poetry is not installed!" -ForegroundColor Red
    Write-Host "Please install Poetry first: https://python-poetry.org/docs/#installation" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Poetry found" -ForegroundColor Green

# Install dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Cyan
poetry install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Initialize database
Write-Host "`n🗄️ Initializing database..." -ForegroundColor Cyan
poetry run ledger-sync init

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to initialize database" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Database initialized" -ForegroundColor Green

# Run tests
Write-Host "`n🧪 Running tests..." -ForegroundColor Cyan
poetry run pytest

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Some tests failed, but setup is complete" -ForegroundColor Yellow
}
else {
    Write-Host "✓ All tests passed" -ForegroundColor Green
}

# Show version
Write-Host "`n📋 Installed version:" -ForegroundColor Cyan
poetry run ledger-sync --version

Write-Host "`n✨ Setup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Activate the Poetry shell: " -NoNewline
Write-Host "poetry shell" -ForegroundColor Yellow
Write-Host "  2. Import an Excel file: " -NoNewline
Write-Host "ledger-sync import your_file.xlsx" -ForegroundColor Yellow
Write-Host "  3. Read the documentation: " -NoNewline
Write-Host "README.md" -ForegroundColor Yellow
Write-Host ""
