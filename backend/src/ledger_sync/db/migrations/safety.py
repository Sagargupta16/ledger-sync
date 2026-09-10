"""Fail unsupported rollback plans before any revision changes the database."""

from collections.abc import Callable
from functools import wraps
from typing import Any, NoReturn

from alembic.util import CommandError


def irreversible(downgrade: Callable[[], None]) -> Callable[[], None]:
    """Mark a revision whose data and schema require backup or forward recovery."""

    @wraps(downgrade)
    def reject() -> NoReturn:
        revision = downgrade.__globals__["revision"]
        raise CommandError(
            f"Revision {revision} has no supported downgrade. "
            "No rollback steps were applied. Restore a verified backup or apply "
            "a forward repair; see db/migrations/MIGRATION_NOTES.md."
        )

    reject.unsupported_downgrade = True
    return reject


def checked_migration_plan(migrate: Callable[..., Any]) -> Callable[..., Any]:
    """Materialize and validate the full plan before Alembic executes its first step."""

    def plan(revisions: Any, migration_context: Any) -> list[Any]:
        steps = list(migrate(revisions, migration_context))
        for step in steps:
            if getattr(step, "is_downgrade", False) and getattr(
                step.migration_fn, "unsupported_downgrade", False
            ):
                step.migration_fn()
        return steps

    return plan
