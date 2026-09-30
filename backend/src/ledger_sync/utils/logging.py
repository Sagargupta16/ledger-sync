"""Logging configuration for ledger-sync.

Provides structured logging with:
- Console output (colorized in dev)
- File logging (rotating)
- Separate analytics log for detailed import/calculation tracking
"""

import logging
import secrets
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from ledger_sync.config.settings import settings


def setup_logging(log_level: str | None = None) -> logging.Logger:
    """Configure application logging.

    Args:
        log_level: Optional log level override

    Returns:
        Configured logger instance

    """
    level = log_level or settings.log_level

    # Main app logger
    main_logger = logging.getLogger("ledger_sync")
    main_logger.setLevel(level)
    main_logger.handlers = []  # Clear existing handlers

    # Console handler with formatting (always works, even in containers)
    console_format = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter(console_format, datefmt="%H:%M:%S"))
    main_logger.addHandler(console_handler)

    # File handlers — optional, skip gracefully in production/containers
    try:
        db_url = settings.database_url
        if db_url.startswith("sqlite:///"):
            db_path = Path(db_url.replace("sqlite:///", ""))
            log_dir = db_path.parent / "logs"
        else:
            log_dir = Path("./logs")
        log_dir.mkdir(exist_ok=True)

        file_format = (
            "%(asctime)s - %(levelname)s - %(name)s - %(funcName)s:%(lineno)d - %(message)s"
        )
        file_handler = RotatingFileHandler(
            log_dir / "ledger_sync.log",
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
        )
        file_handler.setLevel(logging.DEBUG)  # Always capture DEBUG to file
        file_handler.setFormatter(logging.Formatter(file_format))
        main_logger.addHandler(file_handler)

        # Analytics-specific logger for detailed import/calculation tracking
        analytics_logger = logging.getLogger("ledger_sync.analytics")
        analytics_logger.setLevel(logging.DEBUG)
        # Clear stale handlers so dev auto-reloads don't duplicate every line.
        # Without this each module re-import attaches another RotatingFileHandler,
        # producing N copies of every analytics log line after N reloads.
        analytics_logger.handlers = []
        # Don't propagate to the parent ledger_sync logger -- analytics has
        # its own dedicated file handler and we don't want each line to
        # also land in ledger_sync.log via the parent's file_handler.
        analytics_logger.propagate = False

        analytics_handler = RotatingFileHandler(
            log_dir / "analytics.log",
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=3,
        )
        analytics_handler.setLevel(logging.DEBUG)
        analytics_handler.setFormatter(logging.Formatter(file_format))
        analytics_logger.addHandler(analytics_handler)
    except OSError:
        # File logging unavailable (read-only filesystem, container, etc.)
        # Console logging still works — this is fine for production.
        main_logger.info("File logging unavailable, using console only")

    return main_logger


def get_analytics_logger() -> logging.Logger:
    """Get the analytics-specific logger for detailed tracking."""
    return logging.getLogger("ledger_sync.analytics")


def log_analytics_calculation(
    calculation_name: str,
    count: int,
    duration_ms: float | None = None,
) -> None:
    """Log an analytics calculation result."""
    logger = get_analytics_logger()
    duration_str = f" ({duration_ms:.1f}ms)" if duration_ms else ""
    logger.info("  + %s: %s records%s", calculation_name, count, duration_str)


def log_error(
    message: str,
    exception: Exception | None = None,
    context: dict[str, object] | None = None,
) -> str:
    """Log an error with optional exception and context; return its error id.

    Only the exception type is logged, never its message: database errors
    embed the SQL bound parameters (ledger amounts, notes, emails) in theirs.
    The returned id correlates this record with whatever the caller reports.
    """
    logger = get_analytics_logger()
    error_id = secrets.token_hex(8)
    logger.error("%s [error_id=%s]", message, error_id)
    if exception:
        logger.error("  Exception: %s [error_id=%s]", type(exception).__name__, error_id)
    if context:
        for key, value in context.items():
            logger.error("  %s: %s", key, value)
    return error_id


# Default logger instance
logger = setup_logging()
