"""FastAPI application for ledger-sync web interface."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ledger_sync.api.account_classifications import (
    router as account_classifications_router,
)
from ledger_sync.api.analytics import router as analytics_router
from ledger_sync.api.analytics_v2 import router as analytics_v2_router
from ledger_sync.api.auth import router as auth_router
from ledger_sync.api.calculations import router as calculations_router
from ledger_sync.api.meta import router as meta_router
from ledger_sync.api.preferences import router as preferences_router
from ledger_sync.api.transactions import router as transactions_router
from ledger_sync.api.upload import router as upload_router
from ledger_sync.config.settings import settings
from ledger_sync.db.session import init_db
from ledger_sync.schemas.transactions import HealthResponse
from ledger_sync.utils.logging import setup_logging

# Initialize logging
setup_logging("INFO")

# Initialize database
init_db()

app = FastAPI(
    title="Ledger Sync API",
    description="Modern API for Excel ingestion and reconciliation",
    version="1.0.0",
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(analytics_v2_router)
app.include_router(calculations_router)
app.include_router(meta_router)
app.include_router(account_classifications_router)
app.include_router(preferences_router)
app.include_router(transactions_router)
app.include_router(upload_router)


@app.get("/")
async def root() -> HealthResponse:
    """Root endpoint - health check."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.get("/health")
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
