"""Independent identity review: adversarial legacy boundaries and source isolation."""

import pytest
from sqlalchemy import select

from ledger_sync.core.import_identity import row_fingerprint
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    CategorizationRule,
    ImportLog,
    Transaction,
    TransactionTag,
)
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError


def _source(**changes):
    return {
        "date": "2026-01-15",
        "amount": "100.00",
        "currency": "INR",
        "account": "Cash",
        "type": "Expense",
        "category": "Other",
        "subcategory": None,
        "note": "purchase",
        **changes,
    }


def _legacy_with_annotations(session, user_id, source, *, occurrence=0):
    normalized = DataNormalizer().normalize_from_dict(source)
    legacy_id = row_fingerprint(normalized, user_id, occurrence, version=1)
    transaction = Transaction(
        transaction_id=legacy_id,
        source_fingerprint=None,
        fingerprint_version=1,
        user_id=user_id,
        **{
            name: normalized[name]
            for name in (
                "date",
                "amount",
                "currency",
                "type",
                "account",
                "category",
                "subcategory",
                "note",
            )
        },
        source_file="legacy.csv",
    )
    session.add(transaction)
    session.flush()
    session.add_all(
        [
            TransactionTag(user_id=user_id, transaction_id=legacy_id, tag=f"original-{occurrence}"),
            Anomaly(
                user_id=user_id,
                transaction_id=legacy_id,
                anomaly_type=AnomalyType.HIGH_EXPENSE,
                severity="low",
                description=f"Original review {occurrence}",
                is_reviewed=True,
                is_dismissed=True,
                review_notes="Keep this decision with its original transaction",
            ),
        ]
    )
    return transaction


def _snapshot(session):
    # Include timestamps, fingerprints, annotations, dimensions, analytics state,
    # and import logs so a rejected snapshot cannot leave partial writes.
    return {
        name: [
            tuple(row)
            for row in session.execute(select(table).order_by(*table.primary_key.columns))
        ]
        for name, table in sorted(Base.metadata.tables.items())
    }


def _legacy_import_log(session, user_id):
    session.add(
        ImportLog(
            user_id=user_id,
            file_hash="0" * 64,
            file_name="legacy.csv",
            rows_processed=2,
            rows_inserted=2,
            rows_updated=0,
            rows_deleted=0,
            rows_skipped=0,
        )
    )


@pytest.mark.parametrize("reverse_snapshot", [False, True])
def test_legacy_pipe_collision_does_not_redirect_annotations(
    test_db_session, test_user, reverse_snapshot
):
    original = _source(category="alpha|beta", subcategory="gamma")
    different = _source(category="alpha", subcategory="beta|gamma")
    normalizer = DataNormalizer()
    normalized = normalizer.normalize_from_dict(original)
    other_normalized = normalizer.normalize_from_dict(different)
    legacy_id = row_fingerprint(normalized, test_user.id, version=1)
    assert legacy_id == row_fingerprint(other_normalized, test_user.id, version=1)
    assert row_fingerprint(normalized, test_user.id) != row_fingerprint(
        other_normalized, test_user.id
    )
    legacy = Transaction(
        transaction_id=legacy_id,
        fingerprint_version=1,
        user_id=test_user.id,
        date=normalized["date"],
        amount=normalized["amount"],
        currency="INR",
        type=normalized["type"],
        account=normalized["account"],
        note=normalized["note"],
        category=normalized["category"],
        subcategory=normalized["subcategory"],
        source_file="legacy.csv",
    )
    test_db_session.add(legacy)
    test_db_session.flush()
    test_db_session.add(
        TransactionTag(user_id=test_user.id, transaction_id=legacy_id, tag="original")
    )
    test_db_session.commit()
    sources = [original, different]
    if reverse_snapshot:
        sources.reverse()

    result = SyncEngine(test_db_session, test_user.id).import_rows(sources, "review.csv", "review")

    assert (result.inserted, result.deleted) == (1, 0)
    test_db_session.expire_all()
    retained = test_db_session.get(Transaction, legacy_id)
    assert retained.category == normalized["category"]
    assert retained.subcategory == normalized["subcategory"]
    assert retained.source_fingerprint == row_fingerprint(normalized, test_user.id)
    assert test_db_session.scalars(select(TransactionTag)).one().transaction_id == legacy_id


def test_rule_collapsed_source_duplicates_reorder_without_changing_owner_or_identity(
    test_db_session, test_user, make_user
):
    other = make_user("review-other@example.com")
    source = _source(category="First")
    second_source = _source(category="Second")
    SyncEngine(test_db_session, other.id).import_rows([source], "other.csv", "other")
    other_row = test_db_session.scalars(
        select(Transaction).where(Transaction.user_id == other.id)
    ).one()
    other_identity = (other_row.transaction_id, other_row.source_fingerprint)
    test_db_session.add(
        CategorizationRule(
            user_id=test_user.id, match_field="note", pattern="purchase", category="Same result"
        )
    )
    test_db_session.commit()
    engine = SyncEngine(test_db_session, test_user.id)
    first = engine.import_rows([source, source, second_source], "first.csv", "first")
    assert first.inserted == 3
    before = {
        row.transaction_id: row.source_fingerprint
        for row in test_db_session.scalars(
            select(Transaction).where(Transaction.user_id == test_user.id)
        )
    }
    assert len(set(before.values())) == 3

    repeated = engine.import_rows([second_source, source, source], "reordered.csv", "reordered")

    assert (repeated.inserted, repeated.updated, repeated.deleted) == (0, 0, 0)
    rows = list(
        test_db_session.scalars(select(Transaction).where(Transaction.user_id == test_user.id))
    )
    assert {row.transaction_id: row.source_fingerprint for row in rows} == before
    assert all(row.category == "Same result" and not row.is_deleted for row in rows)
    test_db_session.refresh(other_row)
    assert (other_row.transaction_id, other_row.source_fingerprint) == other_identity
    assert other_row.category == "First"
    assert not other_row.is_deleted


@pytest.mark.parametrize("reverse_snapshot", [False, True])
def test_legacy_rule_collapsed_distinct_sources_reject_atomically(
    test_db_session, test_user, reverse_snapshot
):
    # The old writer hashed only the rule result. Neither occurrence tells us
    # whether its annotations originally belonged to source First or Second.
    for occurrence in (0, 1):
        _legacy_with_annotations(
            test_db_session, test_user.id, _source(category="Same result"), occurrence=occurrence
        )
    test_db_session.add(
        CategorizationRule(
            user_id=test_user.id, match_field="note", pattern="purchase", category="Same result"
        )
    )
    _legacy_import_log(test_db_session, test_user.id)
    test_db_session.commit()
    before = _snapshot(test_db_session)
    sources = [_source(category="First"), _source(category="Second")]
    if reverse_snapshot:
        sources.reverse()
    # This otherwise valid addition also must disappear on rejection.
    sources.insert(0, _source(amount="250.00", category="New category", note="new purchase"))

    with pytest.raises(NormalizationError, match=r"(?i)ambiguous|collision|conflict"):
        SyncEngine(test_db_session, test_user.id).import_rows(
            sources, "reordered.csv", "0" * 64, force=True
        )

    test_db_session.expire_all()
    assert _snapshot(test_db_session) == before


@pytest.mark.parametrize("with_rule", [False, True])
def test_identical_legacy_source_duplicates_remain_adoptable_by_occurrence(
    test_db_session, test_user, with_rule
):
    source = _source(category="First" if with_rule else "Same result")
    legacy_ids = [
        _legacy_with_annotations(
            test_db_session, test_user.id, _source(category="Same result"), occurrence=occurrence
        ).transaction_id
        for occurrence in (0, 1)
    ]
    if with_rule:
        test_db_session.add(
            CategorizationRule(
                user_id=test_user.id,
                match_field="note",
                pattern="purchase",
                category="Same result",
            )
        )
    test_db_session.commit()
    before = _snapshot(test_db_session)

    result = SyncEngine(test_db_session, test_user.id).import_rows(
        [source, source], "duplicates.csv", "duplicates"
    )

    assert (result.inserted, result.updated, result.deleted, result.skipped) == (0, 0, 0, 2)
    test_db_session.expire_all()
    normalized = DataNormalizer().normalize_from_dict(source)
    for occurrence, legacy_id in enumerate(legacy_ids):
        stored = test_db_session.get(Transaction, legacy_id)
        assert stored.source_fingerprint == row_fingerprint(normalized, test_user.id, occurrence)
        assert stored.fingerprint_version == 2
        assert not stored.is_deleted
    assert set(test_db_session.scalars(select(Transaction.transaction_id))) == set(legacy_ids)
    after = _snapshot(test_db_session)
    for table in ("transaction_tags", "anomalies"):
        assert after[table] == before[table]


def test_lone_conflicting_legacy_pipe_candidate_rejects_without_economic_fallback(
    test_db_session, test_user
):
    original = _source(category="alpha|beta", subcategory="gamma")
    different = _source(category="alpha", subcategory="beta|gamma")
    legacy = _legacy_with_annotations(test_db_session, test_user.id, original)
    incoming = DataNormalizer().normalize_from_dict(different)
    assert legacy.transaction_id == row_fingerprint(incoming, test_user.id, version=1)
    _legacy_import_log(test_db_session, test_user.id)
    test_db_session.commit()
    before = _snapshot(test_db_session)

    # A single economic match is insufficient when its v1 key matches but
    # its actual category field boundaries contradict the only source row.
    with pytest.raises(NormalizationError, match=r"(?i)ambiguous|collision|conflict"):
        SyncEngine(test_db_session, test_user.id).import_rows(
            [different], "different.csv", "0" * 64, force=True
        )

    test_db_session.expire_all()
    assert _snapshot(test_db_session) == before


@pytest.mark.parametrize("with_rule", [False, True])
@pytest.mark.parametrize("reviewed_category", ["Previously reviewed", "Previously|reviewed"])
def test_unambiguous_recategorized_legacy_source_keeps_id_and_annotations(
    test_db_session, test_user, with_rule, reviewed_category
):
    source = _source(category="First")
    legacy = _legacy_with_annotations(test_db_session, test_user.id, source)
    legacy_id = legacy.transaction_id
    # A previous edit changed the stored classification without rehashing.
    legacy.category = reviewed_category
    if with_rule:
        test_db_session.add(
            CategorizationRule(
                user_id=test_user.id,
                match_field="note",
                pattern="purchase",
                category="Same result",
            )
        )
    test_db_session.commit()
    before = _snapshot(test_db_session)

    result = SyncEngine(test_db_session, test_user.id).import_rows(
        [source], "recategorized.csv", "recategorized"
    )

    assert (result.inserted, result.updated, result.deleted) == (0, 1, 0)
    test_db_session.expire_all()
    stored = test_db_session.scalars(select(Transaction)).one()
    assert stored.transaction_id == legacy_id
    assert stored.source_fingerprint == row_fingerprint(
        DataNormalizer().normalize_from_dict(source), test_user.id
    )
    assert stored.fingerprint_version == 2
    assert stored.category == ("Same result" if with_rule else "First")
    assert not stored.is_deleted
    after = _snapshot(test_db_session)
    for table in ("transaction_tags", "anomalies"):
        assert after[table] == before[table]
