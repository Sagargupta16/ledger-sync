"""Tax data normalizer."""

from decimal import Decimal
from typing import Any

import pandas as pd


def normalize_tax_data(df: pd.DataFrame, file_name: str) -> list[dict[str, Any]]:
    """Normalize tax data from uploaded Excel file.

    Expected columns:
    - Financial Year (e.g., "2022-23")
    - Gross Salary / Salary
    - Bonus
    - Stipend
    - RSU / Stock Options
    - Other Income
    - Total Gross Income
    - TDS Deducted / TDS
    - Advance Tax
    - Self Assessment Tax
    - Total Tax Paid
    - Standard Deduction
    - 80C Deduction / Section 80C
    - 80D Deduction / Section 80D / Health Insurance
    - Other Deductions
    - Total Deductions
    - Taxable Income / Net Taxable Income
    - Notes

    Args:
        df: DataFrame with tax data
        file_name: Name of the source file

    Returns:
        List of normalized tax records
    """
    # Normalize column names - convert to string first
    df.columns = df.columns.astype(str).str.strip().str.lower()

    # Debug: Print available columns
    print(f"Available columns after normalization: {list(df.columns)}")

    # Column mapping
    column_mapping = {
        "financial year": "financial_year",
        "fy": "financial_year",
        "year": "financial_year",
        "gross salary": "gross_salary",
        "salary": "gross_salary",
        "bonus": "bonus",
        "stipend": "stipend",
        "rsu": "rsu",
        "stock options": "rsu",
        "stock": "rsu",
        "other income": "other_income",
        "total gross income": "total_gross_income",
        "gross income": "total_gross_income",
        "total income": "total_gross_income",
        "tds deducted": "tds_deducted",
        "tds": "tds_deducted",
        "advance tax": "advance_tax",
        "self assessment tax": "self_assessment_tax",
        "total tax paid": "total_tax_paid",
        "tax paid": "total_tax_paid",
        "standard deduction": "standard_deduction",
        "80c deduction": "section_80c",
        "section 80c": "section_80c",
        "80c": "section_80c",
        "80d deduction": "section_80d",
        "section 80d": "section_80d",
        "80d": "section_80d",
        "health insurance": "section_80d",
        "other deductions": "other_deductions",
        "total deductions": "total_deductions",
        "deductions": "total_deductions",
        "taxable income": "taxable_income",
        "net taxable income": "taxable_income",
        "notes": "notes",
        "remarks": "notes",
    }

    # Rename columns based on mapping
    for old_name, new_name in column_mapping.items():
        if old_name in df.columns:
            df = df.rename(columns={old_name: new_name})

    # Required columns
    required_cols = ["financial_year", "total_gross_income", "total_tax_paid", "taxable_income"]

    # Check for required columns
    for col in required_cols:
        if col not in df.columns:
            msg = f"Missing required column: {col}"
            raise ValueError(msg)

    # Convert numeric columns
    numeric_columns = [
        "gross_salary",
        "bonus",
        "stipend",
        "rsu",
        "other_income",
        "total_gross_income",
        "tds_deducted",
        "advance_tax",
        "self_assessment_tax",
        "total_tax_paid",
        "standard_deduction",
        "section_80c",
        "section_80d",
        "other_deductions",
        "total_deductions",
        "taxable_income",
    ]

    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Convert FY to string
    df["financial_year"] = df["financial_year"].astype(str).str.strip()

    # Filter out empty rows
    df = df[df["financial_year"].notna() & (df["financial_year"] != "")]

    # Prepare records
    records = []
    for _, row in df.iterrows():
        record = {
            "financial_year": row["financial_year"],
            "gross_salary": Decimal(str(row.get("gross_salary", 0) or 0)),
            "bonus": Decimal(str(row.get("bonus", 0) or 0)),
            "stipend": Decimal(str(row.get("stipend", 0) or 0)),
            "rsu": Decimal(str(row.get("rsu", 0) or 0)),
            "other_income": Decimal(str(row.get("other_income", 0) or 0)),
            "total_gross_income": Decimal(str(row["total_gross_income"])),
            "tds_deducted": Decimal(str(row.get("tds_deducted", 0) or 0)),
            "advance_tax": Decimal(str(row.get("advance_tax", 0) or 0)),
            "self_assessment_tax": Decimal(str(row.get("self_assessment_tax", 0) or 0)),
            "total_tax_paid": Decimal(str(row["total_tax_paid"])),
            "standard_deduction": Decimal(str(row.get("standard_deduction", 0) or 0)),
            "section_80c": Decimal(str(row.get("section_80c", 0) or 0)),
            "section_80d": Decimal(str(row.get("section_80d", 0) or 0)),
            "other_deductions": Decimal(str(row.get("other_deductions", 0) or 0)),
            "total_deductions": Decimal(str(row.get("total_deductions", 0) or 0)),
            "taxable_income": Decimal(str(row["taxable_income"])),
            "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else None,
            "source_file": file_name,
        }
        records.append(record)

    return records
