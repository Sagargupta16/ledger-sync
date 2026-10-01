"""Manual quick-add and tag replacement: the two ledger writes on this router."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from ledger_sync.api.transactions_impl.filters import TRANSACTION_TYPE_MAP
from ledger_sync.api.transactions_impl.serialize import _to_transaction_response
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
from ledger_sync.core.query_helpers import as_naive
from ledger_sync.db.models import Transaction, TransactionTag, TransactionType, User
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.ingest.normalizer import DataNormalizer
from ledger_sync.schemas.transactions import TransactionCreateRequest, TransactionResponse
from ledger_sync.services.ledger_dimensions import sync_transaction_dimensions

# Shared hasher and normalizer instances (stateless, safe to reuse)
_hasher = TransactionHasher()
_normalizer = DataNormalizer()


def _manual_duplicate_exists(
    db: Session, fingerprint: str, identity_fields: dict[str, Any], *, legacy_account: str
) -> bool:
    """Recognize legacy manual rows without trusting ambiguous v1 field boundaries."""
    # The former manual API hashed the display account even for transfers.
    legacy_id = _hasher.generate_transaction_id(
        **{**identity_fields, "account": legacy_account}, version=1
    )
    candidates = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == identity_fields["user_id"],
            or_(
                Transaction.transaction_id == fingerprint,
                Transaction.source_fingerprint == fingerprint,
                (Transaction.transaction_id == legacy_id)
                & Transaction.source_fingerprint.is_(None),
            ),
        )
        .all()
    )
    # Two primary-key candidates and one user-unique fingerprint at most.
    for candidate in candidates:
        if candidate.transaction_id == fingerprint or candidate.source_fingerprint == fingerprint:
            return True
        candidate_fingerprint = _hasher.generate_transaction_id(
            # The matching legacy ID already binds the original submitted date
            # encoding; storage may have discarded its timezone.
            date=identity_fields["date"],
            amount=candidate.amount,
            account=(
                candidate.from_account or candidate.account
                if candidate.type == TransactionType.TRANSFER
                else candidate.account
            ),
            note=candidate.note,
            category=candidate.category,
            subcategory=candidate.subcategory,
            tx_type=candidate.type.value,
            user_id=candidate.user_id,
            to_account=candidate.to_account if candidate.type == TransactionType.TRANSFER else None,
            currency=candidate.currency,
        )
        if candidate_fingerprint == fingerprint:
            return True
    return False


def create_manual_transaction(
    db: Session, user: User, body: TransactionCreateRequest
) -> TransactionResponse:
    """Insert one manual row with the import pipeline's deterministic ID.

    Raises 409 for a duplicate (including a legacy v1-hashed manual row);
    invalidates analytics in the same transaction. The schema pattern already
    rejects an unknown type with 422.
    """
    tx_type = TRANSACTION_TYPE_MAP[body.type.lower()]

    now = datetime.now(UTC)
    # The importer's rounding (ROUND_HALF_UP to paise), so 2.675 is 2.68 on
    # both paths rather than float rounding's 2.67.
    amount = _normalizer.normalize_amount(body.amount)

    # Generate deterministic transaction ID (same logic as ingest pipeline)
    identity_fields: dict[str, Any] = {
        "date": body.date,
        "amount": amount,
        "account": (
            body.from_account or body.account
            if tx_type == TransactionType.TRANSFER
            else body.account
        ),
        "note": body.note,
        "category": body.category,
        "subcategory": body.subcategory,
        "tx_type": body.type,
        "user_id": user.id,
        "to_account": body.to_account if tx_type == TransactionType.TRANSFER else None,
        "currency": "INR",
    }
    transaction_id = _hasher.generate_transaction_id(**identity_fields)

    # Serialize with imports and refresh before reading or changing this ledger.
    lock_analytics_user(db, user.id)
    if _manual_duplicate_exists(db, transaction_id, identity_fields, legacy_account=body.account):
        raise HTTPException(
            status_code=409,
            detail="A transaction with identical fields already exists.",
        )

    transaction = Transaction(
        transaction_id=transaction_id,
        source_fingerprint=transaction_id,
        fingerprint_version=2,
        user_id=user.id,
        # Keep the submitted wall-clock value. An aware datetime would be
        # converted by PostgreSQL's session zone, moving a +05:30 midnight
        # onto the previous day.
        date=as_naive(body.date),
        amount=amount,
        currency="INR",
        type=tx_type,
        category=body.category,
        subcategory=body.subcategory,
        account=body.account,
        from_account=body.from_account,
        to_account=body.to_account,
        note=body.note,
        source_file="manual_entry",
        last_seen_at=now,
        created_at=now,
        updated_at=now,
        is_deleted=False,
    )

    sync_transaction_dimensions(db, transaction)
    db.add(transaction)
    # DateTime stores the submitted wall-clock day without a timezone.
    mark_ledger_changed(db, user.id, [transaction.date.date()])
    db.commit()
    db.refresh(transaction)

    return _to_transaction_response(transaction)


def replace_transaction_tags(
    db: Session, user: User, transaction_id: str, raw_tags: list[str]
) -> list[str]:
    """Replace a live transaction's tags; return the normalized stored list.

    Raises 404 for a missing/soft-deleted/foreign transaction and 422 for a tag
    over 50 characters or more than 10 tags.
    """
    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id == transaction_id,
            Transaction.user_id == user.id,
            Transaction.is_deleted.is_(False),
        )
        .first()
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Normalize: trim, drop empties, reject overlong, dedupe preserving order.
    tags: list[str] = []
    for raw in raw_tags:
        tag = raw.strip()
        if not tag:
            continue
        if len(tag) > 50:
            raise HTTPException(
                status_code=422,
                detail=f"Tag exceeds 50 characters: {tag[:50]}...",
            )
        if tag not in tags:
            tags.append(tag)
    if len(tags) > 10:
        raise HTTPException(status_code=422, detail="A transaction can have at most 10 tags")

    db.execute(
        delete(TransactionTag).where(
            TransactionTag.user_id == user.id,
            TransactionTag.transaction_id == transaction_id,
        )
    )
    for tag in tags:
        db.add(
            TransactionTag(
                user_id=user.id,
                transaction_id=transaction_id,
                tag=tag,
            )
        )
    db.commit()
    return tags
