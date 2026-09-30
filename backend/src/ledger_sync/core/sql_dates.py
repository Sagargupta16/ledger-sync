"""Database-agnostic date formatting for SQL expressions.

``fmt_*`` build expressions that compile to ``strftime`` on SQLite and
``to_char`` on PostgreSQL. The dialect comes from the engine the statement
executes on, not from the configured URL at import time, so one process can
query SQLite and PostgreSQL correctly. ``query_helpers`` re-exports these, and
callers keep importing them from there.
"""

from __future__ import annotations

from typing import Any, ClassVar

from sqlalchemy import String
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.compiler import SQLCompiler
from sqlalchemy.sql.functions import FunctionElement


class _FormattedDate(FunctionElement[str]):
    """A date rendered as text, spelled for whichever dialect compiles it.

    Each subclass is its own cache key, so its formats are part of it.
    """

    type = String()
    inherit_cache = True
    sqlite_format: ClassVar[str]
    postgres_format: ClassVar[str]


class _YearMonth(_FormattedDate):
    inherit_cache = True
    sqlite_format = "%Y-%m"
    postgres_format = "YYYY-MM"


class _Year(_FormattedDate):
    inherit_cache = True
    sqlite_format = "%Y"
    postgres_format = "YYYY"


class _Month(_FormattedDate):
    inherit_cache = True
    sqlite_format = "%m"
    postgres_format = "MM"


class _Day(_FormattedDate):
    inherit_cache = True
    sqlite_format = "%Y-%m-%d"
    postgres_format = "YYYY-MM-DD"


# The format is a class constant rendered inline, not a bind parameter: a SELECT
# and its GROUP BY then spell the identical expression, which PostgreSQL needs
# to accept the grouped column.
@compiles(_FormattedDate, "sqlite")
def _compile_sqlite_date(element: _FormattedDate, compiler: SQLCompiler, **kw: Any) -> str:
    return f"strftime('{element.sqlite_format}', {compiler.process(element.clauses, **kw)})"


@compiles(_FormattedDate)
def _compile_postgres_date(element: _FormattedDate, compiler: SQLCompiler, **kw: Any) -> str:
    return f"to_char({compiler.process(element.clauses, **kw)}, '{element.postgres_format}')"


def fmt_year_month(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY-MM'.

    Compiles to strftime for SQLite, to_char for PostgreSQL.
    """
    return _YearMonth(date_col)


def fmt_year(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY'."""
    return _Year(date_col)


def fmt_month(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'MM' (zero-padded)."""
    return _Month(date_col)


def fmt_date(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY-MM-DD'."""
    return _Day(date_col)
