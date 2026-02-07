"""Logging configuration for ledger-sync.

Provides structured logging with:
- Console output (colorized in dev)
- File logging (rotating)
- Separate analytics log for detailed import/calculation tracking
"""

import logging
import sys
from datetime import UTC, datetime
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

    # Create logs directory next to database or in current dir
    db_url = settings.database_url
    if db_url.startswith("sqlite:///"):
        db_path = Path(db_url.replace("sqlite:///", ""))
        log_dir = db_path.parent / "logs"
    else:
        log_dir = Path("./logs")
    log_dir.mkdir(exist_ok=True)

    # Main app logger
    main_logger = logging.getLogger("ledger_sync")
    main_logger.setLevel(level)
    main_logger.handlers = []  # Clear existing handlers

    # Console handler with formatting
    console_format = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter(console_format, datefmt="%H:%M:%S"))
    main_logger.addHandler(console_handler)

    # File handler for persistent logs (rotating, max 10MB, keep 5 files)
    file_format = "%(asctime)s - %(levelname)s - %(name)s - %(funcName)s:%(lineno)d - %(message)s"
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

    analytics_handler = RotatingFileHandler(
        log_dir / "analytics.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=3,
    )
    analytics_handler.setLevel(logging.DEBUG)
    analytics_handler.setFormatter(logging.Formatter(file_format))
    analytics_logger.addHandler(analytics_handler)

    return main_logger


def get_analytics_logger() -> logging.Logger:
    """Get the analytics-specific logger for detailed tracking."""
    return logging.getLogger("ledger_sync.analytics")


def log_import_start(source_file: str) -> None:
    """Log the start of an import operation."""
    logger = get_analytics_logger()
    logger.info("=" * 60)
    logger.info("IMPORT STARTED: %s", source_file)
    logger.info("Timestamp: %s", datetime.now(tz=UTC).isoformat())
    logger.info("=" * 60)


def log_import_stats(stats: dict) -> None:
    """Log import statistics."""
    logger = get_analytics_logger()
    logger.info("Import Statistics:")
    for key, value in stats.items():
        logger.info("  %s: %s", key, value)


def log_analytics_calculation(
    calculation_name: str,
    count: int,
    duration_ms: float | None = None,
) -> None:
    """Log an analytics calculation result."""
    logger = get_analytics_logger()
    duration_str = f" ({duration_ms:.1f}ms)" if duration_ms else ""
    logger.info("  + %s: %s records%s", calculation_name, count, duration_str)


def log_column_mapping(original: str, mapped: str, source_file: str | None = None) -> None:
    """Log a column name mapping (for tracking Excel format changes)."""
    logger = get_analytics_logger()
    file_str = f" in {source_file}" if source_file else ""
    logger.debug("Column mapping%s: '%s' -> '%s'", file_str, original, mapped)


def log_warning(message: str, context: dict | None = None) -> None:
    """Log a warning with optional context."""
    logger = get_analytics_logger()
    logger.warning(message)
    if context:
        for key, value in context.items():
            logger.warning("  %s: %s", key, value)


def log_error(
    message: str,
    exception: Exception | None = None,
    context: dict | None = None,
) -> None:
    """Log an error with optional exception and context."""
    logger = get_analytics_logger()
    logger.error(message)
    if exception:
        logger.error("  Exception: %s: %s", type(exception).__name__, exception)
    if context:
        for key, value in context.items():
            logger.error("  %s: %s", key, value)


# Default logger instance
logger = setup_logging()
