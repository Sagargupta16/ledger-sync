"""The shared shape of one insight.

Its own module so the two generator files depend on one definition of the
insight dict instead of each carrying a copy.
"""

from __future__ import annotations

Insight = dict[str, str]


def build_insight(title: str, description: str, severity: str) -> Insight:
    """Build one insight. *severity* must be from ``INSIGHT_SEVERITIES``."""
    return {"title": title, "description": description, "severity": severity}
