"""Isolated synthetic SQLite benchmark; run directly, never against user data.

From backend: .venv/Scripts/python.exe tests/benchmark_transaction_pagination.py
Reports warm medians for identical result sets, including the exact total count
required by the API. Existing ORM indexes only; no proposed search index.
Every variant uses the same deterministic ordering, owner/active/search filters,
and full-filter total. Count SQL AND bound parameters are checked for equality.
Timings rotate variant order per repetition. They include ORM materialization
and pagination/cursor work, but exclude HTTP, tags, filter construction, and
the one-time acquisition of an existing cursor anchor. This measures a later
page in an ongoing traversal; it does not claim random cursor access is free.
"""

import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from statistics import median
from time import perf_counter

from sqlalchemy import create_engine, event, insert
from sqlalchemy.orm import Session

from ledger_sync.api.transaction_pagination import _encode_cursor, transaction_page
from ledger_sync.api.transactions import SearchFilters, _apply_search_filters, _apply_sorting
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User

ROWS_PER_USER = 50_000
REPEATS = 9
LIMIT = 100


def _measure_comparison(session: Session, runs: dict[str, Callable]) -> dict:
    statements = []

    def record(_conn, _cursor, statement, parameters, _context, _executemany):
        statements.append((statement, parameters))

    for run in runs.values():
        run()  # Warm every variant before collecting measurements.
    timings = {name: [] for name in runs}
    query_counts = {name: [] for name in runs}
    count_counts = {name: [] for name in runs}
    count_scopes = set()
    variants = list(runs.items())
    event.listen(session.bind, "before_cursor_execute", record)
    try:
        for repetition in range(REPEATS):
            rotation = repetition % len(variants)
            for name, run in variants[rotation:] + variants[:rotation]:
                statements.clear()
                started = perf_counter()
                run()
                timings[name].append((perf_counter() - started) * 1000)
                query_counts[name].append(len(statements))
                counts = [(sql, params) for sql, params in statements if "count(" in sql.lower()]
                count_counts[name].append(len(counts))
                count_scopes.update(counts)
    finally:
        event.remove(session.bind, "before_cursor_execute", record)
    assert len(count_scopes) == 1, "Compared variants used different full-filter count scopes"
    assert all(len(set(counts)) == 1 for counts in query_counts.values())
    assert all(len(set(counts)) == 1 for counts in count_counts.values())
    return {
        name: {
            "median_ms": round(median(timings[name]), 3),
            "sql_queries": query_counts[name][0],
            "count_queries": count_counts[name][0],
        }
        for name in runs
    }


def benchmark() -> dict:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        users = [
            User(email=f"synthetic-{index}@example.com", hashed_password="") for index in range(2)
        ]
        session.add_all(users)
        session.flush()
        user_ids = [user.id for user in users]
        for user_id in user_ids:
            session.execute(
                insert(Transaction),
                [
                    {
                        "transaction_id": f"{user_id:04x}{index:060x}",
                        "user_id": user_id,
                        "date": datetime(2020, 1, 1, tzinfo=UTC) + timedelta(days=index // 50),
                        "amount": Decimal(index % 10000) / 100,
                        "type": TransactionType.EXPENSE,
                        "account": "Cash",
                        "category": "Food",
                        "note": "rare purchase" if index % 1000 == 0 else "routine purchase",
                        "source_file": "synthetic.csv",
                        "is_deleted": False,
                    }
                    for index in range(ROWS_PER_USER)
                ],
            )
        session.commit()
        base = session.query(Transaction).filter(
            Transaction.user_id == user_ids[0], Transaction.is_deleted.is_(False)
        )
        result = {
            "database": "SQLite in memory",
            "rows": ROWS_PER_USER * 2,
            "repeats": REPEATS,
            "timing_order": "rotating, all variants warmed",
            "scope": "identical owner, active, and search filters; totals exclude cursor seek",
            "excluded_work": "HTTP, tags, filter construction, initial cursor acquisition",
        }
        cases = {}
        for name, filters, offset in [
            ("unfiltered_deep", SearchFilters(), 40_000),
            ("common_substring_deep", SearchFilters(query="purchase"), 40_000),
            ("rare_substring_first", SearchFilters(query="rare"), 0),
            ("missing_substring_first", SearchFilters(query="unmatched"), 0),
        ]:
            filtered = _apply_search_filters(base, filters)
            ordered = _apply_sorting(filtered, "date", "desc")

            def legacy(query=filtered, sorted_query=ordered, start=offset):
                total = query.count()
                rows = sorted_query.offset(start).limit(LIMIT).all()
                return rows, total

            def offset_page(sorted_query=ordered, start=offset):
                return transaction_page(
                    sorted_query, limit=LIMIT, offset=start, cursor=None, context="0" * 64
                )

            expected, total = legacy()
            actual = offset_page()
            assert [tx.transaction_id for tx in actual[0]] == [tx.transaction_id for tx in expected]
            assert actual[1] == total
            case = {
                "matches": total,
                "offset": offset,
                "count_sql_and_parameters_identical": True,
            }
            runs = {"legacy_count_then_page": legacy, "page_with_inferred_count": offset_page}
            if offset:
                boundary = ordered.offset(offset - 1).first()
                cursor = _encode_cursor(boundary, "0" * 64, offset)

                def cursor_page(sorted_query=ordered, token=cursor):
                    return transaction_page(
                        sorted_query, limit=LIMIT, offset=0, cursor=token, context="0" * 64
                    )

                actual = cursor_page()
                assert [tx.transaction_id for tx in actual[0]] == [
                    tx.transaction_id for tx in expected
                ]
                assert actual[1] == total
                runs["cursor_with_exact_count"] = cursor_page
            case.update(_measure_comparison(session, runs))
            cases[name] = case
        result["cases"] = cases
        return result


if __name__ == "__main__":
    import sys

    sys.stdout.write(json.dumps(benchmark(), indent=2) + "\n")
