"""CSV file loading."""

import hashlib
from pathlib import Path

import pandas as pd

from ledger_sync.ingest.validator import ExcelValidator, ValidationError
from ledger_sync.utils.logging import logger


class CsvLoader:
    """Loads and validates CSV files.

    Re-uses the same column-validation logic as the Excel pipeline so that
    CSV files with identical column names are accepted transparently.
    """

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

        with file_path.open("rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)

        return sha256_hash.hexdigest()

    def load(
        self,
        file_path: Path,
    ) -> tuple[pd.DataFrame, dict[str, str], str]:
        """Load CSV file and validate.

        Args:
            file_path: Path to CSV file

        Returns:
            Tuple of (DataFrame, column_mapping, file_hash)

        Raises:
            ValidationError: If validation fails

        """
        logger.info(f"Loading CSV file: {file_path}")

        # Calculate file hash for idempotency
        file_hash = self.calculate_file_hash(file_path)
        logger.debug(f"File hash: {file_hash}")

        try:
            df = pd.read_csv(file_path, encoding="utf-8")
            logger.info(f"Loaded {len(df)} rows from CSV")
        except UnicodeDecodeError:
            # Fall back to latin-1 which accepts any byte sequence
            try:
                df = pd.read_csv(file_path, encoding="latin-1")
                logger.info(f"Loaded {len(df)} rows from CSV (latin-1 fallback)")
            except (ValueError, OSError) as e:
                msg = f"Failed to read CSV file: {e}"
                raise ValidationError(msg) from e
        except (ValueError, OSError) as e:
            msg = f"Failed to read CSV file: {e}"
            raise ValidationError(msg) from e

        # Validate columns (reuse the same validator, but skip file-extension check)
        column_mapping = self.validator.validate_columns(df)
        self.validator.validate_data_types(df, column_mapping)
        logger.info("CSV file validation passed")

        return df, column_mapping, file_hash
