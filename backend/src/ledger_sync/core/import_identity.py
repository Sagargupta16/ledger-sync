"""Versioned source identity and batched adoption of legacy transaction IDs."""

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.ingest.normalizer import NormalizationError

_HASHER = TransactionHasher()
_CHUNK_SIZE = 200


def row_fingerprint(
    row: dict[str, Any], user_id: int, occurrence: int = 0, *, version: int = 2
) -> str:
    """Hash a normalized source row, including both transfer endpoints."""
    return _HASHER.generate_transaction_id(
        date=row["date"],
        amount=row["amount"],
        account=row.get("from_account") or row["account"],
        note=row.get("note"),
        category=row.get("category"),
        subcategory=row.get("subcategory"),
        tx_type=row["type"],
        user_id=user_id,
        occurrence=occurrence,
        to_account=row.get("to_account"),
        currency=row.get("currency", "INR"),
        version=version,
    )


def capture_source_identities(rows: list[dict[str, Any]], user_id: int) -> None:
    """Capture identity before user categorization rules mutate the source fields."""
    occurrences: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        base = row_fingerprint(row, user_id)
        leg = row.get("transfer_leg", "out") if row.get("is_transfer") else ""
        key = (base, leg)
        occurrence = occurrences[key]
        occurrences[key] += 1
        row["_source_fingerprint"] = row_fingerprint(row, user_id, occurrence)
        row["_legacy_source_id"] = row_fingerprint(row, user_id, occurrence, version=1)
        row["_source_category"] = row.get("category")
        row["_source_subcategory"] = row.get("subcategory")


@dataclass(frozen=True)
class ImportIdentity:
    fingerprint: str
    legacy_id: str
    legacy_source_id: str


def identity_for(row: dict[str, Any], user_id: int, occurrence: int = 0) -> ImportIdentity:
    fingerprint = row.get("_source_fingerprint") or row_fingerprint(row, user_id, occurrence)
    legacy_id = row_fingerprint(row, user_id, occurrence, version=1)
    return ImportIdentity(fingerprint, legacy_id, row.get("_legacy_source_id", legacy_id))


def _source_row(row: dict[str, Any]) -> dict[str, Any]:
    """Restore captured source labels for a verified pre-rule legacy lookup."""
    return {
        **row,
        "category": row.get("_source_category", row.get("category")),
        "subcategory": row.get("_source_subcategory", row.get("subcategory")),
    }


def _same_legacy_fields(existing: Transaction, row: dict[str, Any]) -> bool:
    """A v1 digest alone is insufficient because its field encoding was ambiguous."""
    fields = ("account", "note", "type", "category", "subcategory")
    if existing.date.replace(tzinfo=None) != row["date"].replace(tzinfo=None):
        return False
    if existing.amount != row["amount"]:
        return False
    for field in fields:
        if _HASHER.normalize_for_hash(getattr(existing, field)) != _HASHER.normalize_for_hash(
            row.get(field)
        ):
            return False
    if existing.type == TransactionType.TRANSFER:
        return all(
            _HASHER.normalize_for_hash(getattr(existing, field))
            == _HASHER.normalize_for_hash(row.get(field))
            for field in ("from_account", "to_account")
        )
    return True


def load_identity_matches(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    identities: list[ImportIdentity],
) -> dict[str, Transaction]:
    """Resolve source fingerprints and verified v1 IDs with bounded batch queries."""
    by_source: dict[str, Transaction] = {}
    by_id: dict[str, Transaction] = {}
    for start in range(0, len(identities), _CHUNK_SIZE):
        chunk = identities[start : start + _CHUNK_SIZE]
        fingerprints = [identity.fingerprint for identity in chunk]
        legacy_ids = {
            key for identity in chunk for key in (identity.legacy_id, identity.legacy_source_id)
        }
        stmt = select(Transaction).where(
            Transaction.user_id == user_id,
            or_(
                Transaction.source_fingerprint.in_(fingerprints),
                Transaction.transaction_id.in_([*fingerprints, *legacy_ids]),
            ),
        )
        for transaction in session.scalars(stmt):
            by_id[transaction.transaction_id] = transaction
            if transaction.source_fingerprint:
                by_source[transaction.source_fingerprint] = transaction

    matches: dict[str, Transaction] = {}
    claimed: set[str] = set()
    # Old writers counted occurrences AFTER rules. When rules collapse distinct
    # source classifications, those old occurrence IDs cannot prove which source
    # owns an annotation. Exact raw-field matches can still establish ownership.
    has_legacy_candidates = any(row.source_fingerprint is None for row in by_id.values())
    post_rule_keys = [
        row_fingerprint(row, user_id) if has_legacy_candidates else "" for row in rows
    ]
    source_labels: dict[str, set[tuple[str, str]]] = defaultdict(set)
    if has_legacy_candidates:
        for row, key in zip(rows, post_rule_keys, strict=True):
            source = _source_row(row)
            source_labels[key].add(
                (
                    _HASHER.normalize_for_hash(source.get("category")),
                    _HASHER.normalize_for_hash(source.get("subcategory")),
                )
            )
    for row, identity, key in zip(rows, identities, post_rule_keys, strict=True):
        match = by_source.get(identity.fingerprint)
        if match is None:
            source = _source_row(row)
            raw_candidate = by_id.get(identity.legacy_source_id)
            if (
                raw_candidate is not None
                and raw_candidate.source_fingerprint is None
                and _same_legacy_fields(raw_candidate, source)
            ):
                match = raw_candidate
        if match is None and has_legacy_candidates and len(source_labels[key]) == 1:
            for candidate_id in (identity.fingerprint, identity.legacy_id):
                candidate = by_id.get(candidate_id)
                if candidate is None or candidate.source_fingerprint is not None:
                    continue
                if _same_legacy_fields(candidate, row):
                    match = candidate
                    break
        if match is not None and match.transaction_id not in claimed:
            matches[identity.fingerprint] = match
            claimed.add(match.transaction_id)
    _adopt_unambiguous_legacy_rows(session, user_id, rows, identities, matches, claimed)
    return matches


def _economic_shape(row: dict[str, Any]) -> tuple[str, ...]:
    """Exact source values other than mutable category assignments."""
    return (
        row["date"].replace(tzinfo=None).isoformat(),
        *(
            _HASHER.normalize_for_hash(row.get(field))
            for field in ("amount", "account", "note", "type", "from_account", "to_account")
        ),
    )


def _legacy_category_encoding(category: str | None, subcategory: str | None) -> str:
    """Old serialization of the two mutable fields, used only to detect ambiguity."""
    return f"{_HASHER.normalize_for_hash(category)}|{_HASHER.normalize_for_hash(subcategory)}"


def _adopt_unambiguous_legacy_rows(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    identities: list[ImportIdentity],
    matches: dict[str, Transaction],
    claimed: set[str],
) -> None:
    """Legacy rules discarded raw categories; adopt only exact one-to-one shapes.

    This is a migration bridge, not fuzzy deduplication. When multiple unmatched
    source rows could own a legacy annotation, reject the snapshot rather than
    silently choosing one. Already-adopted rows never use this fallback.
    """
    if all(identity.fingerprint in matches for identity in identities):
        return
    source_counts: dict[tuple[str, ...], int] = defaultdict(int)
    for row in rows:
        source_counts[_economic_shape(row)] += 1
    legacy: dict[tuple[str, ...], list[Transaction]] = defaultdict(list)
    for transaction in session.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id, Transaction.source_fingerprint.is_(None)
        )
    ):
        if transaction.transaction_id in claimed:
            continue
        values = {
            field: getattr(transaction, field)
            for field in ("date", "amount", "account", "note", "type", "from_account", "to_account")
        }
        legacy[_economic_shape(values)].append(transaction)
    for row, identity in zip(rows, identities, strict=True):
        if identity.fingerprint in matches:
            continue
        shape = _economic_shape(row)
        candidates = legacy.get(shape, [])
        if not candidates:
            continue
        source = _source_row(row)
        ambiguous_boundary = any(
            candidate.transaction_id == identity.legacy_source_id
            and not _same_legacy_fields(candidate, source)
            and _legacy_category_encoding(candidate.category, candidate.subcategory)
            == _legacy_category_encoding(source.get("category"), source.get("subcategory"))
            for candidate in candidates
        )
        if ambiguous_boundary or len(candidates) != 1 or source_counts[shape] != 1:
            raise NormalizationError(
                "Legacy transactions have ambiguous source identities after categorization. "
                "No snapshot changes were committed. Review these duplicate source rows "
                "before re-importing; existing transactions and annotations are preserved."
            )
        matches[identity.fingerprint] = candidates[0]
        claimed.add(candidates[0].transaction_id)
