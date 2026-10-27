"""Daily quotes, stock splits and reference rates for the foreign-asset reports.

Yahoo's daily closes are split-adjusted to the share count of the day they are
fetched: AMZN's 2022-05-31 close reads about $120, not the $2,400 it traded at,
because of the 20:1 split on 2022-06-06. A lot's value on a day is therefore its
vest-date shares, times every split after the vest, times that day's adjusted
close; ``split_factor`` gives the split part.
"""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

# A quote or rate this many days before the wanted day still stands in for it.
STALE_DAYS = 10


@dataclass(frozen=True, slots=True)
class DailyQuote:
    day: date
    close: Decimal
    high: Decimal | None
    low: Decimal | None


@dataclass(frozen=True, slots=True)
class Split:
    """A split's ex-date, the first day the shares trade on the new count."""

    day: date
    numerator: Decimal
    denominator: Decimal

    @property
    def ratio(self) -> Decimal:
        """New shares per old share: 20 for a 20-for-1 split, 0.1 for a 1-for-10 reverse."""
        return self.numerator / self.denominator

    @property
    def label(self) -> str:
        return f"{self.numerator.normalize():f}:{self.denominator.normalize():f}"


def split_factor(splits: Iterable[Split], after: date, through: date = date.max) -> Decimal:
    """Shares now per share held when ``after`` closed, for splits up to ``through``.

    A split takes effect at the open of its ex-date, so shares received on the
    ex-date are already on the new count.
    """
    factor = Decimal(1)
    for split in splits:
        if after < split.day <= through:
            factor *= split.ratio
    return factor


class RateSeries:
    """Published rates by day; a day without one uses the last one before it."""

    def __init__(self, rates: Mapping[date, Decimal]) -> None:
        self._days = sorted(rates)
        self._rates = dict(rates)

    def on_or_before(self, day: date) -> tuple[date, Decimal] | None:
        index = bisect_right(self._days, day)
        if index == 0 or (day - self._days[index - 1]).days > STALE_DAYS:
            return None
        found = self._days[index - 1]
        return found, self._rates[found]

    def __bool__(self) -> bool:
        return bool(self._days)


def quote_on_or_before(quotes: Sequence[DailyQuote], day: date) -> DailyQuote | None:
    """The last trading day's quote on or shortly before ``day`` (quotes sorted by day)."""
    index = bisect_right([quote.day for quote in quotes], day)
    if index == 0:
        return None
    best = quotes[index - 1]
    return None if (day - best.day).days > STALE_DAYS else best
