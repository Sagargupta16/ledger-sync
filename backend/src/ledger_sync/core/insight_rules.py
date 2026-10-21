"""Calendar rules for the repo-wide partial-month split.

* **Totals may include the month in progress.** Money already spent is real.
* **Averages, trends, volatility, peaks and growth rates may not.** A month
  three days old is not a comparable observation. Measured against the real
  workbook, letting one in-progress month into a rate produced a -696.8%
  figure, and on the Income Analysis page it turned a true +18.1% growth rate
  into -95.6%.

``is_partial_month`` deliberately matches the frontend's ``getMonthProgress``
(``frontend/src/lib/dateUtils.ts``) so the same month is judged the same way on
both sides of the API: only the CURRENT month can be partial, and not on its
final calendar day, where every day of the month already exists.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date


def month_key(moment: date) -> str:
    """The ``YYYY-MM`` bucket a date falls in, matching ``group_by_month``."""
    return f"{moment.year:04d}-{moment.month:02d}"


def is_partial_month(key: str, today: date) -> bool:
    """Whether the ``YYYY-MM`` month *key* is still in progress on *today*.

    Past and future months are both complete for comparison purposes -- only
    the current one can be partial, and not on its last day.
    """
    # `startswith` rather than a slice comparison (S6659): a `YYYY-MM-DD` key and
    # a `YYYY-MM` one both have to answer for the same month, and this states that
    # without depending on the slice width matching `month_key`'s output length.
    if not key.startswith(month_key(today)):
        return False
    return today.day < monthrange(today.year, today.month)[1]
