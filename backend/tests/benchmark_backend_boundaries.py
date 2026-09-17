"""Synthetic SQLite benchmark; never reads an application database or provider.

Run from backend: .venv/Scripts/python.exe tests/benchmark_backend_boundaries.py
Timings include tracemalloc overhead. Counts and parity are deterministic;
elapsed time and memory are local measurements, not production estimates.
"""

import asyncio
import gc
import json
import math
import os
import secrets
import statistics
import time
import tracemalloc
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import patch


def _measure(factory, operation):
    from sqlalchemy import event

    from ledger_sync.db.models import Transaction, User

    samples = []
    result = None
    for _ in range(3):
        gc.collect()
        with factory() as session:
            user = session.get(User, 1)
            _ = user.preferences
            hydrated = []

            def on_load(_transaction, _context, records=hydrated):
                records.append(1)

            event.listen(Transaction, "load", on_load)
            tracemalloc.start()
            started = time.perf_counter()
            try:
                result = operation(session, user)
                elapsed = (time.perf_counter() - started) * 1000
                peak = tracemalloc.get_traced_memory()[1] / 1024
            finally:
                tracemalloc.stop()
                event.remove(Transaction, "load", on_load)
            samples.append((elapsed, peak, len(hydrated)))
    return result, {
        "median_ms": round(statistics.median(sample[0] for sample in samples), 2),
        "median_peak_kib": round(statistics.median(sample[1] for sample in samples), 1),
        "transaction_objects": samples[-1][2],
    }


def _equivalent(left, right):
    if isinstance(left, float):
        return math.isclose(left, right, rel_tol=1e-12, abs_tol=1e-8)
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _equivalent(item, right[key]) for key, item in left.items()
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _equivalent(a, b) for a, b in zip(left, right, strict=True)
        )
    return left == right


async def _event_loop_delay(offload):
    from starlette.concurrency import run_in_threadpool

    async def work():
        if offload:
            await run_in_threadpool(time.sleep, 0.12)
        else:
            time.sleep(0.12)

    ticks = []

    async def heartbeat():
        started = time.perf_counter()
        await asyncio.sleep(0.01)
        ticks.append((time.perf_counter() - started) * 1000)

    # Schedule the heartbeat first so its deadline exists before the DB wait.
    await asyncio.gather(heartbeat(), work())
    return round(ticks[0], 2)


def main():
    os.environ["LEDGER_SYNC_DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["LEDGER_SYNC_ENVIRONMENT"] = "development"
    os.environ["LEDGER_SYNC_JWT_SECRET_KEY"] = secrets.token_urlsafe(32)
    os.environ["LEDGER_SYNC_DB_BOOTSTRAP_ON_STARTUP"] = "false"

    from fastapi import FastAPI
    from sqlalchemy import create_engine, event, insert
    from sqlalchemy.orm import sessionmaker

    from ledger_sync.api import main as runtime
    from ledger_sync.api.calculations_helpers import (
        _compute_category_monthly_history,
        _compute_income_analysis,
    )
    from ledger_sync.core.query_helpers import build_transaction_query
    from ledger_sync.db.base import Base
    from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
    from ledger_sync.services.calculation_service import category_monthly_history, income_analysis

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as session:
        session.add(User(id=1, email="synthetic@example.test"))
        session.flush()
        session.add(UserPreferences(user_id=1))
        session.execute(
            insert(Transaction),
            [
                {
                    "transaction_id": f"synthetic-{index}",
                    "user_id": 1,
                    "date": datetime(2006 + index % 20, 1 + (index // 20) % 12, 15, tzinfo=UTC),
                    "type": TransactionType.INCOME if index % 10 == 0 else TransactionType.EXPENSE,
                    "amount": Decimal("12.34"),
                    "account": "Synthetic",
                    "category": f"Synthetic {index % 7}",
                    "source_file": "synthetic.csv",
                    "note": "synthetic benchmark record " * 5,
                }
                for index in range(50_000)
            ],
        )
        session.commit()

    months = [f"2025-{month:02}" for month in range(1, 13)]
    operations = {
        "category_history": (
            lambda db, user: _compute_category_monthly_history(
                build_transaction_query(db, user)
                .filter(Transaction.type == TransactionType.EXPENSE)
                .all(),
                TransactionType.EXPENSE,
                months,
            ),
            lambda db, user: category_monthly_history(db, user, months, TransactionType.EXPENSE),
        ),
        "income_analysis": (
            lambda db, user: _compute_income_analysis(
                list(build_transaction_query(db, user).all()), []
            ),
            lambda db, user: income_analysis(
                db, user, start_date=None, end_date=None, cashback_categories=[], category=None
            ),
        ),
    }
    report = {"synthetic_transactions": 50_000, "repeats": 3}
    for name, (before, after) in operations.items():
        old, old_stats = _measure(factory, before)
        new, new_stats = _measure(factory, after)
        if not _equivalent(old, new):
            raise AssertionError(f"Response parity failed for {name}")
        report[name] = {"before": old_stats, "after": new_stats, "parity": True}

    statements = []

    def count_statement(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", count_statement)
    Base.metadata.create_all(engine)
    old_count = len(statements)
    statements.clear()

    async def startup():
        async with runtime.lifespan(FastAPI()):
            pass

    with patch.object(runtime, "init_db", lambda: Base.metadata.create_all(engine)):
        asyncio.run(startup())
    report["startup_schema_statements"] = {"before": old_count, "after": len(statements)}
    report["ten_ms_event_loop_tick_ms"] = {
        "before": asyncio.run(_event_loop_delay(False)),
        "after": asyncio.run(_event_loop_delay(True)),
    }
    event.remove(engine, "before_cursor_execute", count_statement)
    engine.dispose()
    print(json.dumps(report, indent=2))  # noqa: T201 - standalone benchmark output


if __name__ == "__main__":
    main()
