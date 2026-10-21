"""Decode the JSON stored in ``UserPreferences`` text columns.

Every JSON preference is a ``Text`` column holding a document such as ``"[]"``
or ``"{}"``. Readers previously each carried their own ``json.loads`` wrapper,
and they disagreed on which failures they caught. This is the one reader: it
never raises, so a malformed or blank value degrades to the caller's default.
"""

from __future__ import annotations

import json
from typing import Any


def parse_json_preference(value: object, default: Any) -> Any:
    """Return the decoded *value*, or *default* when there is nothing usable.

    ``None`` and a string that is blank or not valid JSON give *default*. A value
    that is not a string (already decoded, e.g. a list or dict) is returned
    unchanged. Callers still check the decoded type themselves.
    """
    if value is None:
        return default
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except ValueError:
        return default
