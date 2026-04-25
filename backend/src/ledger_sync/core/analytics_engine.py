"""Backwards-compat facade for the old ``analytics_engine`` module.

The real ``AnalyticsEngine`` now lives in the ``core.analytics`` package,
split by domain into mixin classes. This file preserves the historic
``from ledger_sync.core.analytics_engine import AnalyticsEngine`` import
path used by ``sync_engine.py`` and ``api/analytics_v2.py``.
"""

from __future__ import annotations

from ledger_sync.core.analytics import AnalyticsEngine

__all__ = ["AnalyticsEngine"]
