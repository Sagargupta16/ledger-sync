"""Excel file validation."""

from pathlib import Path

import pandas as pd

from ledger_sync.config.settings import settings


class ValidationError(Exception):
    """Raised when validation fails."""

    pass


class ExcelValidator:
    """Validates Excel files before processing."""

    def __init__(self) -> None:
        """Initialize validator."""
        self.required_column_groups = {
            "date": settings.date_column_names,
            "account": settings.account_column_names,
            "category": settings.category_column_names,
            "amount": settings.amount_column_names,
            "type": settings.type_column_names,
        }
        # Optional columns
        self.optional_column_groups = {
            "note": settings.note_column_names,
        }

    def validate_file_exists(self, file_path: Path) -> None:
        """Validate that file exists.

        Args:
            file_path: Path to Excel file

        Raises:
            ValidationError: If file doesn't exist or isn't readable
        """
        if not file_path.exists():
            raise ValidationError(f"File not found: {file_path}")

        if not file_path.is_file():
            raise ValidationError(f"Path is not a file: {file_path}")

        if file_path.suffix.lower() not in [".xlsx", ".xls"]:
            raise ValidationError(f"File must be Excel format (.xlsx or .xls): {file_path}")

    def validate_columns(self, df: pd.DataFrame) -> dict[str, str]:
        """Validate that required columns exist.

        Args:
            df: DataFrame to validate

        Returns:
            Mapping of standardized column names to actual column names

        Raises:
            ValidationError: If required columns are missing
        """
        columns = set(df.columns)
        column_mapping: dict[str, str] = {}

        for col_type, possible_names in self.required_column_groups.items():
            found = None
            for name in possible_names:
                if name in columns:
                    found = name
                    break

            if found is None:
                raise ValidationError(
                    f"Missing required column type '{col_type}'. "
                    f"Expected one of: {', '.join(possible_names)}"
                )

            column_mapping[col_type] = found

        # Add optional columns if found
        for col_type, possible_names in self.optional_column_groups.items():
            for name in possible_names:
                if name in columns:
                    column_mapping[col_type] = name
                    break

        return column_mapping

    def validate_data_types(self, df: pd.DataFrame, column_mapping: dict[str, str]) -> None:
        """Validate basic data types.

        Args:
            df: DataFrame to validate
            column_mapping: Column name mapping

        Raises:
            ValidationError: If data types are invalid
        """
        # Check for empty dataframe
        if df.empty:
            raise ValidationError("Excel file contains no data rows")

        # Validate amount column is numeric
        amount_col = column_mapping["amount"]
        if not pd.api.types.is_numeric_dtype(df[amount_col]):
            # Try to convert
            try:
                pd.to_numeric(df[amount_col], errors="coerce")
            except Exception as e:
                raise ValidationError(
                    f"Amount column '{amount_col}' must contain numeric values: {e}"
                )

    def validate(self, file_path: Path, df: pd.DataFrame) -> dict[str, str]:
        """Run all validations.

        Args:
            file_path: Path to Excel file
            df: DataFrame to validate

        Returns:
            Column name mapping

        Raises:
            ValidationError: If any validation fails
        """
        self.validate_file_exists(file_path)
        column_mapping = self.validate_columns(df)
        self.validate_data_types(df, column_mapping)

        return column_mapping
