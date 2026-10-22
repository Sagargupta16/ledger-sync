"""Versioned source identity and batched adoption of legacy transaction IDs."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.source_identity import adopt_edited_source_rows, match_source_uids
from ledger_sync.db.models import Anomaly, Transaction, TransactionTag, TransactionType
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


def _load_candidates(
    session: Session, user_id: int, identities: list[ImportIdentity]
) -> tuple[dict[str, Transaction], dict[str, Transaction]]:
    """Batch-load rows keyed by source fingerprint and by transaction ID."""
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
    return by_source, by_id


def _source_label_sets(
    rows: list[dict[str, Any]], post_rule_keys: list[str]
) -> dict[str, set[tuple[str, str]]]:
    """Distinct pre-rule category labels behind each post-rule identity."""
    source_labels: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for row, key in zip(rows, post_rule_keys, strict=True):
        source = _source_row(row)
        source_labels[key].add(
            (
                _HASHER.normalize_for_hash(source.get("category")),
                _HASHER.normalize_for_hash(source.get("subcategory")),
            )
        )
    return source_labels


def _match_row(
    row: dict[str, Any],
    identity: ImportIdentity,
    by_source: dict[str, Transaction],
    by_id: dict[str, Transaction],
    *,
    allow_post_rule_ids: bool,
) -> Transaction | None:
    """Find the stored row for one source row, preferring the strongest proof."""
    match = by_source.get(identity.fingerprint)
    if match is not None:
        return match
    raw_candidate = by_id.get(identity.legacy_source_id)
    if (
        raw_candidate is not None
        and raw_candidate.source_fingerprint is None
        and _same_legacy_fields(raw_candidate, _source_row(row))
    ):
        return raw_candidate
    if not allow_post_rule_ids:
        return None
    for candidate_id in (identity.fingerprint, identity.legacy_id):
        candidate = by_id.get(candidate_id)
        if (
            candidate is not None
            and candidate.source_fingerprint is None
            and _same_legacy_fields(candidate, row)
        ):
            return candidate
    return None


def load_identity_matches(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    identities: list[ImportIdentity],
) -> dict[str, Transaction]:
    """Resolve source UIDs, fingerprints and verified v1 IDs with bounded batch queries."""
    matches: dict[str, Transaction] = {}
    claimed: set[str] = set()
    fingerprints = [identity.fingerprint for identity in identities]
    match_source_uids(session, user_id, rows, fingerprints, matches, claimed)
    by_source, by_id = _load_candidates(session, user_id, identities)
    # Old writers counted occurrences AFTER rules. When rules collapse distinct
    # source classifications, those old occurrence IDs cannot prove which source
    # owns an annotation. Exact raw-field matches can still establish ownership.
    has_legacy_candidates = any(row.source_fingerprint is None for row in by_id.values())
    post_rule_keys = [
        row_fingerprint(row, user_id) if has_legacy_candidates else "" for row in rows
    ]
    source_labels = _source_label_sets(rows, post_rule_keys) if has_legacy_candidates else {}
    for row, identity, key in zip(rows, identities, post_rule_keys, strict=True):
        if identity.fingerprint in matches:
            continue
        match = _match_row(
            row,
            identity,
            by_source,
            by_id,
            allow_post_rule_ids=has_legacy_candidates and len(source_labels[key]) == 1,
        )
        if match is not None and match.transaction_id not in claimed:
            matches[identity.fingerprint] = match
            claimed.add(match.transaction_id)
    _adopt_unambiguous_legacy_rows(session, user_id, rows, identities, matches, claimed)
    adopt_edited_source_rows(session, user_id, rows, fingerprints, matches, claimed)
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


_Shape = tuple[str, ...]
_Pending = list[tuple[dict[str, Any], ImportIdentity]]

# Conflicting groups named in the rejection; the rest are counted.
_CONFLICTS_SHOWN = 3


def _unclaimed_legacy_by_shape(
    session: Session, user_id: int, claimed: set[str]
) -> dict[_Shape, list[Transaction]]:
    legacy: dict[_Shape, list[Transaction]] = defaultdict(list)
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
    return legacy


def _annotated_ids(session: Session, user_id: int) -> set[str]:
    """Transactions that carry something of their own: a tag or an anomaly."""
    tagged = select(TransactionTag.transaction_id).where(TransactionTag.user_id == user_id)
    flagged = select(Anomaly.transaction_id).where(
        Anomaly.user_id == user_id, Anomaly.transaction_id.is_not(None)
    )
    return {*session.scalars(tagged), *(tid for tid in session.scalars(flagged) if tid)}


def _interchangeable(candidates: list[Transaction], annotated: set[str]) -> bool:
    """Stored copies identical in every stored field, with nothing attached to any of them.

    For such copies every one-to-one pairing with the file's identical rows
    stores the same ledger, so choosing one is not a guess about ownership.
    """
    labels = {(c.category, c.subcategory, c.currency) for c in candidates}
    return len(labels) == 1 and not any(c.transaction_id in annotated for c in candidates)


def _crosses_boundary(
    candidates: list[Transaction], row: dict[str, Any], identity: ImportIdentity
) -> bool:
    """A v1 digest that names a candidate whose raw fields disagree but encode the same."""
    source = _source_row(row)
    return any(
        candidate.transaction_id == identity.legacy_source_id
        and not _same_legacy_fields(candidate, source)
        and _legacy_category_encoding(candidate.category, candidate.subcategory)
        == _legacy_category_encoding(source.get("category"), source.get("subcategory"))
        for candidate in candidates
    )


def _conflict_error(conflicts: list[tuple[_Pending, list[Transaction]]]) -> NormalizationError:
    described = [
        f"{group[0][0]['date']:%Y-%m-%d}, {group[0][0]['amount']} on {group[0][0]['account']} "
        f"({len(group)} in the file, {len(candidates)} stored)"
        for group, candidates in conflicts[:_CONFLICTS_SHOWN]
    ]
    more = len(conflicts) - len(described)
    listing = "; ".join(described) + (f"; and {more} more" if more > 0 else "")
    return NormalizationError(
        "Legacy transactions have ambiguous source identities after categorization. "
        "No snapshot changes were committed. Review these duplicate source rows "
        f"before re-importing: {listing}. Existing transactions and annotations are preserved."
    )


def _adopt_unambiguous_legacy_rows(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    identities: list[ImportIdentity],
    matches: dict[str, Transaction],
    claimed: set[str],
) -> None:
    """Legacy rules discarded raw categories; adopt only shapes whose owner is certain.

    This is a migration bridge, not fuzzy deduplication. A shape with one stored
    copy and one source row is adopted directly. Several identical rows are
    paired only when their stored copies are interchangeable; when they could
    own different categories or annotations, the whole snapshot is rejected
    rather than silently choosing. Already-adopted rows never use this fallback.
    """
    if all(identity.fingerprint in matches for identity in identities):
        return
    legacy = _unclaimed_legacy_by_shape(session, user_id, claimed)
    source_counts = Counter(_economic_shape(row) for row in rows)
    pending: dict[_Shape, _Pending] = defaultdict(list)
    for row, identity in zip(rows, identities, strict=True):
        shape = _economic_shape(row)
        if identity.fingerprint not in matches and legacy.get(shape):
            pending[shape].append((row, identity))
    annotated = _annotated_ids(session, user_id) if pending else set()
    conflicts: list[tuple[_Pending, list[Transaction]]] = []
    for shape, group in pending.items():
        candidates = legacy[shape]
        if any(_crosses_boundary(candidates, row, identity) for row, identity in group):
            conflicts.append((group, candidates))
            continue
        one_to_one = len(candidates) == 1 and source_counts[shape] == 1
        if not one_to_one and not _interchangeable(candidates, annotated):
            conflicts.append((group, candidates))
            continue
        # Interchangeable copies pair in a stable order; leftovers on either side
        # follow the normal insert and soft-delete path.
        ordered = sorted(candidates, key=lambda candidate: candidate.transaction_id)
        for (_row, identity), candidate in zip(group, ordered, strict=False):
            matches[identity.fingerprint] = candidate
            claimed.add(candidate.transaction_id)
    if conflicts:
        raise _conflict_error(conflicts)
