"""``alembic upgrade head`` must succeed against an EMPTY database.

Nothing exercised this path before: CI never ran migrations from scratch, and
the production workflow only applies new revisions to a Neon database that
already carries the whole history. Meanwhile ``init_db()`` calls
``create_all()`` on startup, so every environment got a correct schema whether
or not the migrations could build one -- the two paths were free to diverge and
did. A new contributor bootstrapping a database from migrations alone hit
``ValueError: No such index: 'ix_fy_summaries_fiscal_year'``.

Three assertions, in the order they fail usefully:

1. the upgrade reaches head at all,
2. the resulting tables and columns match what the ORM declares, because
   reaching head with a schema the app cannot query is not a working bootstrap,
3. re-running the upgrade is a no-op (guards stay idempotent).

Index NAMES are deliberately not compared: ``create_all`` derives them from the
model (``ix_<table>_<column>``) while the migrations chose their own
(``ix_fy_summary_year``), and that cosmetic split predates this test. Columns
are what queries break on.

The upgrade runs in a subprocess against a temp-file SQLite database. Alembic's
``env.py`` builds its own engine from settings, and the migrations use batch
mode (which recreates tables), so an in-process in-memory database is not a
usable target.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from ledger_sync.db import models  # noqa: F401  (registers every table on Base)
from ledger_sync.db.base import Base

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _run_upgrade(db_path: Path) -> subprocess.CompletedProcess[str]:
    """Run ``alembic upgrade head`` against ``db_path``."""
    env = {
        **os.environ,
        "LEDGER_SYNC_DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        # Alembic's env.py imports settings; keep this run independent of any
        # developer .env so the test target is always the temp database.
        "LEDGER_SYNC_JWT_SECRET_KEY": "test-secret-key-at-least-32-characters-long",
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture
def migrated_db(tmp_path: Path) -> Path:
    """An empty SQLite database upgraded to head, or a failure with the traceback."""
    db_path = tmp_path / "from_scratch.db"
    result = _run_upgrade(db_path)
    if result.returncode != 0:
        pytest.fail(
            "alembic upgrade head failed against an empty database:\n"
            f"{result.stdout}\n{result.stderr}"
        )
    return db_path


def test_upgrade_head_reaches_head(migrated_db: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{migrated_db.as_posix()}")
    with engine.connect() as conn:
        revisions = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalars().all()
    engine.dispose()

    assert len(revisions) == 1, f"expected a single head, got {revisions}"


def test_migrated_schema_has_every_orm_table(migrated_db: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{migrated_db.as_posix()}")
    migrated = set(sa.inspect(engine).get_table_names())
    engine.dispose()

    missing = sorted(set(Base.metadata.tables) - migrated)
    assert not missing, f"tables the ORM needs that no migration creates: {missing}"


def test_migrated_schema_has_every_orm_column(migrated_db: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{migrated_db.as_posix()}")
    inspector = sa.inspect(engine)
    tables = set(inspector.get_table_names())

    missing: dict[str, list[str]] = {}
    for name, table in Base.metadata.tables.items():
        if name not in tables:
            continue  # reported by the table test
        actual = {col["name"] for col in inspector.get_columns(name)}
        if gap := sorted({c.name for c in table.columns} - actual):
            missing[name] = gap
    engine.dispose()

    assert not missing, f"columns the ORM needs that no migration creates: {missing}"


def test_upgrade_head_is_idempotent(migrated_db: Path) -> None:
    result = _run_upgrade(migrated_db)
    assert result.returncode == 0, (
        "re-running upgrade head on an up-to-date database failed:\n"
        f"{result.stdout}\n{result.stderr}"
    )
