"""Excel file loading."""

import hashlib
from pathlib import Path

import pandas as pd

from ledger_sync.ingest.validator import ExcelValidator, ValidationError
from ledger_sync.utils.logging import logger


class ExcelLoader:
    """Loads and validates Excel files."""

    def __init__(self) -> None:
        """Initialize loader."""
        self.validator = ExcelValidator()

    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of file.

        Args:
            file_path: Path to file

        Returns:
            Hex-encoded file hash
        """
        sha256_hash = hashlib.sha256()

        with open(file_path, "rb") as f:
            # Read file in chunks for memory efficiency
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)

        return sha256_hash.hexdigest()

    def load(
        self, file_path: Path, sheet_name: str | int | None = 0
    ) -> tuple[pd.DataFrame, dict[str, str], str]:
        """Load Excel file and validate.

        Args:
            file_path: Path to Excel file
            sheet_name: Sheet name or index to load

        Returns:
            Tuple of (DataFrame, column_mapping, file_hash)

        Raises:
            ValidationError: If validation fails
        """
        logger.info(f"Loading Excel file: {file_path}")

        # Calculate file hash for idempotency
        file_hash = self.calculate_file_hash(file_path)
        logger.debug(f"File hash: {file_hash}")

        try:
            # Load Excel file
            df = pd.read_excel(file_path, sheet_name=sheet_name, engine="openpyxl")
            logger.info(f"Loaded {len(df)} rows from Excel")

        except Exception as e:
            raise ValidationError(f"Failed to read Excel file: {e}")

        # Validate
        column_mapping = self.validator.validate(file_path, df)
        logger.info("Excel file validation passed")

        return df, column_mapping, file_hash
