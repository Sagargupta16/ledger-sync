"""Request and response models for the bank-alert inbox."""

from typing import Literal

from pydantic import BaseModel, Field

BankAlertDirection = Literal["debit", "credit"]
BankAlertStatus = Literal["matched", "missing", "ignored"]


class BankAlertIngestRequest(BaseModel):
    """The raw text of one bank SMS or email, as an automation forwards it.

    ``sender`` is optional: an SMS sender code (``AX-HDFCBK``) or the alert
    email address helps name the bank, and the body is enough without it.
    """

    text: str = Field(min_length=1, max_length=10_000)
    sender: str | None = Field(default=None, max_length=120)


class BankAlertSummary(BaseModel):
    """What was read from one alert. ``occurred_on`` is an IST ``YYYY-MM-DD``."""

    id: int
    direction: BankAlertDirection
    amount: float
    account_tail: str | None
    merchant: str | None
    bank: str | None
    occurred_on: str


class BankAlertIngestResponse(BaseModel):
    """``duplicate``: this text on this day, or this payment's reference and amount,
    was already stored.

    Error responses carry ``detail`` instead of ``status``, which an automation
    can test for.
    """

    status: Literal["created", "duplicate"]
    alert: BankAlertSummary


class BankAlertEntry(BankAlertSummary):
    """An alert and its match against the current ledger.

    ``received_at`` is UTC ISO-8601. ``after_last_import`` means the alert
    arrived after the newest import finished, so the next backup may still
    bring its row.
    """

    received_at: str
    status: BankAlertStatus
    after_last_import: bool
    matched_transaction_id: str | None


class BankAlertCounts(BaseModel):
    matched: int
    missing: int
    ignored: int


class BankAlertList(BaseModel):
    """Alerts from ``since`` (IST ``YYYY-MM-DD``) on, newest first.

    ``truncated``: more alerts occurred in the requested days than one read
    returns, so ``since`` was moved up to the oldest whole day returned, and
    ``alerts`` and ``counts`` cover exactly the days from ``since`` on.
    """

    alerts: list[BankAlertEntry]
    counts: BankAlertCounts
    window_days: int
    since: str
    truncated: bool
    last_import_at: str | None


class BankAlertUpdate(BaseModel):
    ignored: bool


class BankAlertUpdated(BaseModel):
    id: int
    ignored: bool
