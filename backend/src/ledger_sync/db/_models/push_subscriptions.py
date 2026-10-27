"""Web Push subscriptions: one row per browser or Home Screen app with alerts on.

A browser makes a push subscription (an endpoint URL at its push service plus
two public keys) when the user taps "Turn on alerts on this device" in
Settings. The endpoint is unique, so a device belongs to one user at a time:
turning alerts on after someone else signed in on it moves the row to them.

``alert_keys`` is a JSON list naming what the daily run last told this device
about (a bill and its due date, a budget and its level, an anomaly), so the
next run alerts only on something new. It never holds amounts or names.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

#: Push service endpoint URLs run to a few hundred characters; this bounds them.
ENDPOINT_MAX_LENGTH = 2048


def utc_now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


class PushSubscription(Base):
    """One device that receives this user's alerts."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(ENDPOINT_MAX_LENGTH), nullable=False)
    # The subscription's public keys (base64url), used to encrypt each message.
    p256dh_key: Mapped[str] = mapped_column(String(128), nullable=False)
    auth_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # What the device said it is, e.g. "iPhone app" or "Chrome on Android".
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    alert_keys: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    __table_args__ = (
        UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        Index("ix_push_subscriptions_user_id", "user_id"),
    )
