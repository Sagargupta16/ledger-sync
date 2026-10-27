"""Persisting one refresh's anomaly findings.

Findings the user already reviewed are suppressed before the per-type caps, so
a dismissed anomaly neither resurrects as a fresh unreviewed row nor takes a
cap slot. The open rows and the engine's own auto-dismissed rows are then
replaced wholesale; rows the user reviewed are kept, so nobody re-dismisses the
same finding after every import.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, delete, or_

from ledger_sync.core.analytics.anomaly_rules import (
    AUTO_DISMISS_PREFIX,
    cap_findings,
    finding_key,
    is_auto_dismissed,
)
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import Anomaly


class AnomalyStoreMixin(AnalyticsEngineBase):
    """Mixin: review suppression, caps and the delete-and-insert of findings."""

    def _replace_findings(self, findings: list[dict[str, Any]]) -> int:
        """Store *findings*; returns the open ones left after review suppression."""
        reviewed = self._reviewed_finding_keys()
        fresh = [
            f
            for f in findings
            if finding_key(
                f["type"], f.get("period_key"), f.get("transaction_id"), f["description"]
            )
            not in reviewed
        ]
        self.db.execute(
            delete(Anomaly).where(
                Anomaly.user_id == self.user_id,
                or_(
                    Anomaly.is_reviewed.is_(False),
                    and_(
                        Anomaly.reviewed_at.is_(None),
                        Anomaly.review_notes.startswith(AUTO_DISMISS_PREFIX),
                    ),
                ),
            )
        )
        for data in cap_findings(fresh):
            self.db.add(self._anomaly_row(data))
        return sum(1 for f in fresh if not f.get("_auto_dismiss"))

    def _reviewed_finding_keys(self) -> set[tuple[Any, ...]]:
        """Identities of findings the user reviewed; the engine's own dismissals excluded."""
        rows = (
            self.db.query(
                Anomaly.anomaly_type,
                Anomaly.period_key,
                Anomaly.transaction_id,
                Anomaly.description,
                Anomaly.reviewed_at,
                Anomaly.review_notes,
            )
            .filter(Anomaly.user_id == self.user_id, Anomaly.is_reviewed.is_(True))
            .all()
        )
        return {
            finding_key(r.anomaly_type, r.period_key, r.transaction_id, r.description)
            for r in rows
            if not is_auto_dismissed(r.reviewed_at, r.review_notes)
        }

    def _anomaly_row(self, data: dict[str, Any]) -> Anomaly:
        # An engine dismissal: reviewed, no reviewed_at, an "Auto-dismissed:" note.
        note = data.get("_auto_dismiss")
        return Anomaly(
            user_id=self.user_id,
            anomaly_type=data["type"],
            severity=data["severity"],
            description=data["description"],
            transaction_id=data.get("transaction_id"),
            period_key=data.get("period_key"),
            expected_value=data.get("expected_value"),
            actual_value=data.get("actual_value"),
            deviation_pct=data.get("deviation_pct"),
            detected_at=datetime.now(UTC),
            is_reviewed=note is not None,
            is_dismissed=note is not None,
            review_notes=note,
        )
