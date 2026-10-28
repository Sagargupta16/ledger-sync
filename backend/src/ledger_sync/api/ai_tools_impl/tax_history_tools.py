"""list_tax_years: every fiscal year's tax figures, for multi-year tax history.

A year comes from an uploaded return (``TaxRecord``) when one exists, else from
the ledger's fiscal-year rollup (``FYSummary``), which knows only the tax paid.
Saved deductions (the /tax page's inputs, ``TaxDeduction``) ride along by year.
Labels differ by source ("FY2024-25", "2024-25"), so years are matched on the
year they start in.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import FYSummary, TaxDeduction, TaxRecord, User

from .registry import ToolSpec, register, to_decimal, to_optional_float
from .schemas import TaxYearsArguments

_START_YEAR = re.compile(r"(\d{4})")


def _start_year(label: str) -> int | None:
    found = _START_YEAR.search(label or "")
    return int(found.group(1)) if found else None


def _from_record(record: TaxRecord) -> dict[str, Any]:
    return {
        "source": "tax_record",
        "gross_income": to_decimal(record.total_gross_income),
        "taxable_income": to_decimal(record.taxable_income),
        "deductions": {
            "standard": to_optional_float(record.standard_deduction),
            "section_80c": to_optional_float(record.section_80c),
            "section_80d": to_optional_float(record.section_80d),
            "other": to_optional_float(record.other_deductions),
            "total": to_optional_float(record.total_deductions),
        },
        "tax_paid": {
            "tds": to_optional_float(record.tds_deducted),
            "advance_tax": to_optional_float(record.advance_tax),
            "self_assessment": to_optional_float(record.self_assessment_tax),
            "total": to_decimal(record.total_tax_paid),
        },
    }


def _from_summary(summary: FYSummary) -> dict[str, Any]:
    return {
        "source": "ledger_summary",
        "gross_income": to_decimal(summary.total_income),
        "taxable_income": None,
        "deductions": None,
        "tax_paid": {
            "tds": None,
            "advance_tax": None,
            "self_assessment": None,
            "total": to_decimal(summary.tax_paid),
        },
    }


def _exec_list_tax_years(user: User, db: Session, args: dict[str, Any]) -> Any:
    records = {
        _start_year(r.financial_year): r
        for r in db.scalars(select(TaxRecord).where(TaxRecord.user_id == user.id))
    }
    summaries = {
        _start_year(s.fiscal_year): s
        for s in db.scalars(select(FYSummary).where(FYSummary.user_id == user.id))
    }
    saved: dict[int | None, dict[str, float]] = defaultdict(dict)
    for row in db.scalars(select(TaxDeduction).where(TaxDeduction.user_id == user.id)):
        saved[_start_year(row.tax_year)][row.section_key] = to_decimal(row.amount)
    years = sorted({y for y in [*records, *summaries] if y is not None}, reverse=True)
    shown = years[: args["limit"]]
    rows = []
    for year in shown:
        record, summary = records.get(year), summaries.get(year)
        label = summary.fiscal_year if summary else f"FY{year}-{(year + 1) % 100:02d}"
        # Every listed year has a record or a summary: the years are their union.
        figures = _from_record(record) if record is not None else _from_summary(summaries[year])
        rows.append({"fiscal_year": label, **figures, "saved_deductions": saved.get(year) or None})
    return {
        "years": rows,
        "years_left_out": len(years) - len(shown),
        "note": (
            "Newest first. tax_record years come from an uploaded return; ledger_summary years "
            "only know the tax-paid total recorded in the ledger. For tax paid month by month, "
            "use aggregate_transactions over the tax categories (find them with list_categories)."
        ),
    }


register(
    ToolSpec(
        name="list_tax_years",
        description=(
            "Every fiscal year's tax figures, newest first: gross and taxable income, deductions "
            "by section, saved deductions and tax paid (TDS, advance, self-assessment). Use for "
            "tax history or multi-year tax charts."
        ),
        arguments_model=TaxYearsArguments,
        execute=_exec_list_tax_years,
    )
)
