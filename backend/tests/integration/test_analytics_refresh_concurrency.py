"""Two independent SQLite sessions exercise the same writer/refresh lock order.

Native PostgreSQL coverage must additionally exercise SELECT FOR UPDATE against
the deployment dialect; SQLite intentionally uses the no-op User UPDATE path.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Event, current_thread

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import analytics_is_current, get_analytics_state
from ledger_sync.db.base import Base
from ledger_sync.db.models import AuditLog, User


def test_simultaneous_refreshes_publish_once(tmp_path):
    db = create_engine(f"sqlite:///{(tmp_path / 'concurrent.sqlite').as_posix()}")
    Base.metadata.create_all(db)
    with Session(db) as session:
        user = User(email="concurrent-refresh@example.com", hashed_password="")
        session.add(user)
        session.commit()
        user_id = user.id

    first_locked = Event()
    second_attempting_lock = Event()
    release_first = Event()

    def observe_lock(_conn, _cursor, statement, _params, _context, _many):
        if current_thread().name.endswith("_1") and statement.upper().startswith("UPDATE USERS"):
            second_attempting_lock.set()

    event.listen(db, "before_cursor_execute", observe_lock)

    def run_refresh(*, pause):
        with Session(db) as session:
            engine = AnalyticsEngine(session, user_id)
            if pause:
                calculate = engine._calculate_daily_summaries

                def hold_lock(transactions, affected_dates):
                    first_locked.set()
                    assert release_first.wait(5), "other refresher never reached the lock"
                    return calculate(transactions, affected_dates)

                engine._calculate_daily_summaries = hold_lock
            return engine.refresh_analytics()

    try:
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="analytics") as pool:
            first = pool.submit(run_refresh, pause=True)
            try:
                assert first_locked.wait(5)
                second = pool.submit(run_refresh, pause=False)
                assert second_attempting_lock.wait(5)
                assert not second.done()
            finally:
                release_first.set()
            assert first.result(timeout=5)["refresh_mode"] == "full"
            assert second.result(timeout=5)["refresh_mode"] == "skipped"
        with Session(db) as session:
            assert analytics_is_current(get_analytics_state(session, user_id))
            assert (
                session.scalar(
                    select(func.count())
                    .select_from(AuditLog)
                    .where(AuditLog.operation == "analytics")
                )
                == 1
            )
    finally:
        event.remove(db, "before_cursor_execute", observe_lock)
        db.dispose()
