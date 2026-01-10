"""Logging configuration."""

import logging
import sys
from typing import Optional

from ledger_sync.config.settings import settings


def setup_logging(log_level: Optional[str] = None) -> logging.Logger:
    """Configure application logging.

    Args:
        log_level: Optional log level override

    Returns:
        Configured logger instance
    """
    level = log_level or settings.log_level

    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    logger = logging.getLogger("ledger_sync")
    logger.setLevel(level)

    return logger


# Default logger instance
logger = setup_logging()
