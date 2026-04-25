"""Analytics engine package.

The public ``AnalyticsEngine`` class is composed from a base class plus a set
of per-domain mixins (summaries, trends, merchants, recurring, net worth,
fiscal-year summaries, anomalies). Each file holds one cohesive concern,
keeping the engine code navigable.
"""

from ledger_sync.core.analytics.engine import AnalyticsEngine

__all__ = ["AnalyticsEngine"]
