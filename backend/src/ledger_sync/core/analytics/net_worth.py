"""Net-worth snapshot + investment holdings mixin."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete

from ledger_sync.core._analytics_helpers import (
    aggregate_holdings_data as _aggregate_holdings_data,
)
from ledger_sync.core._analytics_helpers import (
    compute_account_balances as _compute_account_balances,
)
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import (
    AccountClassification,
    InvestmentHolding,
    NetWorthSnapshot,
    Transaction,
)


class NetWorthMixin(AnalyticsEngineBase):
    """Mixin: net-worth snapshot + investment holdings persistence."""

    def _calculate_net_worth_snapshot(
        self,
        all_transactions: list[Transaction] | None = None,
    ) -> dict[str, Any]:
        """Calculate and store a net-worth snapshot, returning a summary dict."""
        if all_transactions is None:
            all_transactions = self._user_transaction_query().all()

        account_balances = _compute_account_balances(all_transactions)

        # Categorize accounts
        ac_query = self.db.query(AccountClassification)
        if self.user_id is not None:
            ac_query = ac_query.filter(AccountClassification.user_id == self.user_id)
        classifications = {ac.account_name: ac.account_type.value for ac in ac_query.all()}

        # Calculate totals by category
        totals = self._categorize_account_balances(account_balances, classifications)
        cash_and_bank = totals["cash_and_bank"]
        stocks = totals["stocks"]
        mutual_funds = totals["mutual_funds"]
        fixed_deposits = totals["fixed_deposits"]
        ppf_epf = totals["ppf_epf"]
        other_assets = totals["other_assets"]
        credit_card_outstanding = totals["credit_card_outstanding"]
        loans_payable = totals["loans_payable"]

        total_investments = stocks + mutual_funds + fixed_deposits + ppf_epf
        total_assets = cash_and_bank + total_investments + other_assets
        total_liabilities = credit_card_outstanding + loans_payable
        net_worth = total_assets - total_liabilities

        net_worth_change, net_worth_change_pct = self._get_net_worth_change(net_worth)

        self._upsert_net_worth_snapshot(
            totals,
            total_investments,
            total_assets,
            total_liabilities,
            net_worth,
            net_worth_change,
            net_worth_change_pct,
        )

        return {
            "net_worth": float(net_worth),
            "total_assets": float(total_assets),
            "total_liabilities": float(total_liabilities),
            "change": float(net_worth_change),
            "change_pct": net_worth_change_pct,
        }

    def _get_net_worth_change(self, net_worth: Decimal) -> tuple[Decimal, float]:
        """Compare *net_worth* against the most recent persisted snapshot."""
        prev_query = self.db.query(NetWorthSnapshot).order_by(
            NetWorthSnapshot.snapshot_date.desc(),
        )
        if self.user_id is not None:
            prev_query = prev_query.filter(NetWorthSnapshot.user_id == self.user_id)
        prev_snapshot = prev_query.first()

        net_worth_change = Decimal(0)
        net_worth_change_pct = 0.0
        if prev_snapshot:
            net_worth_change = net_worth - prev_snapshot.net_worth
            if prev_snapshot.net_worth is not None and prev_snapshot.net_worth != 0:
                net_worth_change_pct = float(net_worth_change / prev_snapshot.net_worth * 100)
        return net_worth_change, net_worth_change_pct

    def _upsert_net_worth_snapshot(
        self,
        totals: dict[str, Decimal],
        total_investments: Decimal,
        total_assets: Decimal,
        total_liabilities: Decimal,
        net_worth: Decimal,
        net_worth_change: Decimal,
        net_worth_change_pct: float,
    ) -> None:
        """Insert or update today's net-worth snapshot row."""
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

        existing_snapshot = (
            self.db.query(NetWorthSnapshot)
            .filter(
                NetWorthSnapshot.user_id == self.user_id,
                NetWorthSnapshot.snapshot_date >= today_start,
                NetWorthSnapshot.snapshot_date <= today_end,
            )
            .first()
        )

        if existing_snapshot:
            existing_snapshot.cash_and_bank = totals["cash_and_bank"]
            existing_snapshot.investments = total_investments
            existing_snapshot.mutual_funds = totals["mutual_funds"]
            existing_snapshot.stocks = totals["stocks"]
            existing_snapshot.fixed_deposits = totals["fixed_deposits"]
            existing_snapshot.ppf_epf = totals["ppf_epf"]
            existing_snapshot.other_assets = totals["other_assets"]
            existing_snapshot.credit_card_outstanding = totals["credit_card_outstanding"]
            existing_snapshot.loans_payable = totals["loans_payable"]
            existing_snapshot.other_liabilities = Decimal(0)
            existing_snapshot.total_assets = total_assets
            existing_snapshot.total_liabilities = total_liabilities
            existing_snapshot.net_worth = net_worth
            existing_snapshot.net_worth_change = net_worth_change
            existing_snapshot.net_worth_change_pct = net_worth_change_pct
            existing_snapshot.source = "upload"
        else:
            self.db.add(
                NetWorthSnapshot(
                    user_id=self.user_id,
                    snapshot_date=now,
                    cash_and_bank=totals["cash_and_bank"],
                    investments=total_investments,
                    mutual_funds=totals["mutual_funds"],
                    stocks=totals["stocks"],
                    fixed_deposits=totals["fixed_deposits"],
                    ppf_epf=totals["ppf_epf"],
                    other_assets=totals["other_assets"],
                    credit_card_outstanding=totals["credit_card_outstanding"],
                    loans_payable=totals["loans_payable"],
                    other_liabilities=Decimal(0),
                    total_assets=total_assets,
                    total_liabilities=total_liabilities,
                    net_worth=net_worth,
                    net_worth_change=net_worth_change,
                    net_worth_change_pct=net_worth_change_pct,
                    created_at=now,
                    source="upload",
                ),
            )

    def _populate_investment_holdings(
        self,
        all_transactions: list[Transaction] | None = None,
    ) -> int:
        """Auto-populate investment holdings from transaction data.

        Dynamically detects investment accounts using user preferences
        (``investment_account_mappings``) and computes net invested amount
        per account. Uses ``_is_investment_account`` / ``_get_investment_type``
        from the ClassificationMixin.
        """
        if all_transactions is None:
            all_transactions = self._user_transaction_query().all()

        if not self.investment_account_patterns:
            return 0

        holdings_data = _aggregate_holdings_data(
            all_transactions,
            self._is_investment_account,  # type: ignore[attr-defined]
        )

        if not holdings_data:
            return 0

        # Delete existing auto-computed holdings for this user
        del_stmt = delete(InvestmentHolding)
        if self.user_id is not None:
            del_stmt = del_stmt.where(InvestmentHolding.user_id == self.user_id)
        self.db.execute(del_stmt)

        now = datetime.now(UTC)
        count = 0
        for account, data in holdings_data.items():
            inv_type = self._get_investment_type(account) or "other"  # type: ignore[attr-defined]
            invested = data["invested"]
            realized = data["income"] - data["expense"]
            # current_value = invested + realized gains (no market data available)
            current_value = invested + realized

            self.db.add(
                InvestmentHolding(
                    user_id=self.user_id,
                    account=account,
                    investment_type=inv_type,
                    invested_amount=invested,
                    current_value=current_value,
                    realized_gains=realized,
                    unrealized_gains=Decimal(0),
                    last_updated=now,
                    is_active=invested > 0,
                ),
            )
            count += 1

        return count

    def _categorize_account_balances(
        self,
        account_balances: dict[str, Decimal],
        classifications: dict[str, str],
    ) -> dict[str, Decimal]:
        """Categorize account balances into asset and liability buckets."""
        result: dict[str, Decimal] = {
            "cash_and_bank": Decimal(0),
            "stocks": Decimal(0),
            "mutual_funds": Decimal(0),
            "fixed_deposits": Decimal(0),
            "ppf_epf": Decimal(0),
            "other_assets": Decimal(0),
            "credit_card_outstanding": Decimal(0),
            "loans_payable": Decimal(0),
        }

        for account, balance in account_balances.items():
            account_type = classifications.get(account, "Other Wallets")
            self._assign_balance_to_bucket(result, account, balance, account_type)

        return result

    def _assign_balance_to_bucket(
        self,
        result: dict[str, Decimal],
        account: str,
        balance: Decimal,
        account_type: str,
    ) -> None:
        """Assign a single account balance to the appropriate bucket."""
        if account_type in ["Bank Accounts", "Cash"]:
            result["cash_and_bank"] += balance
        elif account_type == "Credit Cards":
            if balance < 0:  # Outstanding balance
                result["credit_card_outstanding"] += abs(balance)
        elif account_type == "Investments":
            self._assign_investment_balance(result, account, balance)
        elif account_type in ("Loans", "Loans/Lended"):
            if balance < 0:
                result["loans_payable"] += abs(balance)
            else:
                result["other_assets"] += balance
        else:
            result["other_assets"] += balance

    def _assign_investment_balance(
        self,
        result: dict[str, Decimal],
        account: str,
        balance: Decimal,
    ) -> None:
        """Bucket an investment-account balance by investment type."""
        inv_type = self._get_investment_type(account)  # type: ignore[attr-defined]
        if not inv_type:
            result["other_assets"] += balance
            return

        inv_type_to_key = {
            "stocks": "stocks",
            "mutual_funds": "mutual_funds",
            "fixed_deposits": "fixed_deposits",
            "ppf_epf": "ppf_epf",
        }
        key = inv_type_to_key.get(inv_type, "other_assets")
        result[key] += balance
