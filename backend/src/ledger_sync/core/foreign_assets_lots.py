"""Lots: the shares one RSU vest put in the user's account, and what happened to them.

A computation aid, not tax advice. A lot keeps its shares on the vest-date count
("vest shares"), so its cost per share stays the vest's. A sale is entered as
the broker shows it, in shares on the sale date, and becomes vest shares by
undoing the splits between the vest and the sale. Two other counts come from
vest shares: ``shares_on`` (the count on a given day, for the forms) and
``market_shares`` (the count Yahoo's split-adjusted quotes are priced in).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from ledger_sync.core.foreign_assets import (
    ESTIMATED_NET_SHARE,
    SaleRecord,
    VestFxRecord,
    VestRecord,
    VestValue,
    value_vest,
)
from ledger_sync.core.foreign_assets_quotes import Split, split_factor

_ZERO = Decimal(0)
# Dividing a sale by a 3-for-1 split leaves repeating decimals; this much is rounding.
_SHARE_TOLERANCE = Decimal("0.000001")


@dataclass(frozen=True, slots=True)
class Lot:
    vest: VestRecord
    value: VestValue
    # Units received at vest (after shares withheld for tax), in vest shares.
    held_quantity: Decimal
    quantity_estimated: bool
    sales: tuple[SaleRecord, ...]
    # The stock's splits after the vest date, oldest first.
    splits: tuple[Split, ...] = ()

    @property
    def lot_id(self) -> str:
        return self.vest.vesting_id

    @property
    def acquired_on(self) -> date:
        return self.vest.vest_date

    @property
    def cost_per_share_inr(self) -> Decimal | None:
        """Per vest share: the vest's tax value over its gross quantity."""
        if self.value.tax_value_inr is None or self.vest.gross_quantity <= 0:
            return None
        return self.value.tax_value_inr / self.vest.gross_quantity

    def cost_inr(self, vest_shares: Decimal) -> Decimal | None:
        per_share = self.cost_per_share_inr
        return None if per_share is None else per_share * vest_shares

    def factor(self, day: date) -> Decimal:
        """Shares on ``day`` per vest share."""
        return split_factor(self.splits, self.acquired_on, day)

    @property
    def current_factor(self) -> Decimal:
        """Shares today per vest share: the count split-adjusted quotes price."""
        return split_factor(self.splits, self.acquired_on)

    def _vest_shares_of(self, sale: SaleRecord) -> Decimal:
        return sale.quantity / self.factor(sale.day)

    @property
    def sold_vest_shares(self) -> Decimal:
        return sum((self._vest_shares_of(sale) for sale in self.sales), _ZERO)

    def vest_shares_before(self, day: date) -> Decimal:
        """Vest shares held as ``day`` opens: sales on that day have not happened yet."""
        if day < self.acquired_on:
            return _ZERO
        sold = sum((self._vest_shares_of(s) for s in self.sales if s.day < day), _ZERO)
        return max(_ZERO, self.held_quantity - sold)

    def vest_shares_after(self, day: date) -> Decimal:
        """Vest shares held when ``day`` closes, after its sales."""
        if day < self.acquired_on:
            return _ZERO
        sold = sum((self._vest_shares_of(s) for s in self.sales if s.day <= day), _ZERO)
        return max(_ZERO, self.held_quantity - sold)

    def shares_on(self, day: date, vest_shares: Decimal) -> Decimal:
        """The share count on ``day`` for ``vest_shares``, as a statement of that day shows."""
        return vest_shares * self.factor(day)

    def market_shares(self, vest_shares: Decimal) -> Decimal:
        """``vest_shares`` on the count that split-adjusted quotes are priced in."""
        return vest_shares * self.current_factor

    @property
    def flags(self) -> tuple[str, ...]:
        extra: list[str] = []
        if self.quantity_estimated:
            extra.append("quantity_estimated")
        if self.sold_vest_shares - self.held_quantity > _SHARE_TOLERANCE:
            extra.append("oversold")
        if self.splits:
            extra.append("split_since_vest")
            if self.value.source == "ecb" and self.value.tax_value_inr is not None:
                # A fetched vest price may be split-adjusted; a typed one is the real price.
                extra.append("vest_price_pre_split")
        return self.value.flags + tuple(extra)


def build_lots(
    vests: Iterable[VestRecord],
    fx_by_vest: Mapping[str, VestFxRecord],
    sales: Sequence[SaleRecord],
    today: date,
    *,
    splits_by_symbol: Mapping[str, Sequence[Split]] | None = None,
    prices_in_inr: bool = True,
) -> list[Lot]:
    """One lot per vest that has happened, oldest first, with its own sales attached."""
    splits_by_symbol = splits_by_symbol or {}
    lots: list[Lot] = []
    for vest in sorted(vests, key=lambda item: (item.vest_date, item.vesting_id)):
        if vest.vest_date > today:
            continue
        estimated = vest.net_quantity is None
        held = (
            vest.net_quantity
            if vest.net_quantity is not None
            else vest.gross_quantity * ESTIMATED_NET_SHARE
        )
        own_sales = tuple(
            sorted((sale for sale in sales if sale.lot_id == vest.vesting_id), key=lambda s: s.day)
        )
        later_splits = tuple(
            split for split in splits_by_symbol.get(vest.symbol, ()) if split.day > vest.vest_date
        )
        lots.append(
            Lot(
                vest=vest,
                value=value_vest(
                    vest, fx_by_vest.get(vest.vesting_id), prices_in_inr=prices_in_inr
                ),
                held_quantity=held,
                quantity_estimated=estimated,
                sales=own_sales,
                splits=later_splits,
            )
        )
    return lots
