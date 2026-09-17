"""Re-imports must preserve identities and annotations through source migration."""

from decimal import Decimal

import pytest
from sqlalchemy import select

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.core.import_identity import row_fingerprint
from ledger_sync.core.rules import apply_rules_retroactively
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.models import CategorizationRule, Transaction, TransactionTag
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError


def _source(**changes) -> dict:
    return {
        "date": "2026-01-15",
        "amount": "100.00",
        "currency": "INR",
        "account": "Cash",
        "type": "Expense",
        "category": "Other",
        "subcategory": None,
        "note": "synthetic purchase",
        **changes,
    }


def _legacy(session, user_id: int, source: dict, *, occurrence: int = 0) -> Transaction:
    normalized = DataNormalizer().normalize_from_dict(source)
    transaction = Transaction(
        transaction_id=row_fingerprint(normalized, user_id, occurrence, version=1),
        user_id=user_id,
        date=normalized["date"],
        amount=normalized["amount"],
        currency="INR",
        type=normalized["type"],
        account=normalized["account"],
        category=normalized["category"],
        subcategory=normalized["subcategory"],
        note=normalized["note"],
        source_file="legacy.csv",
        fingerprint_version=1,
    )
    session.add(transaction)
    session.flush()
    session.add(
        TransactionTag(user_id=user_id, transaction_id=transaction.transaction_id, tag="keep")
    )
    session.commit()
    return transaction


def test_rules_remain_saved_when_analytics_flush_fails(two_user_client, monkeypatch):
    client, session, user, _, _ = two_user_client
    legacy = _legacy(session, user.id, _source())
    identity = legacy.transaction_id
    session.add(
        CategorizationRule(user_id=user.id, match_field="note", pattern="purchase", category="Food")
    )
    session.commit()

    def fail_refresh(engine, source_file=None):
        row = engine.db.get(Transaction, identity)
        row.amount = Decimal("-1")
        engine.db.flush()

    monkeypatch.setattr(AnalyticsEngine, "refresh_analytics", fail_refresh)
    response = client.post("/api/categorization-rules/apply")

    assert response.status_code == 200
    assert response.json() == {"matched": 1, "updated": 1, "analytics_refreshed": False}
    session.expire_all()
    stored = session.get(Transaction, identity)
    assert stored.category == "Food"
    assert stored.amount == Decimal("100.00")
    assert session.scalars(select(TransactionTag)).one().transaction_id == identity


def test_exact_legacy_reimport_preserves_primary_id_and_tags(test_db_session, test_user):
    source = _source()
    legacy = _legacy(test_db_session, test_user.id, source)
    old_id = legacy.transaction_id
    engine = SyncEngine(test_db_session, test_user.id)
    result = engine.import_rows([source], "new.csv", "new-file")
    assert (result.inserted, result.deleted) == (0, 0)
    stored = test_db_session.scalars(select(Transaction)).one()
    assert stored.transaction_id == old_id
    assert stored.source_fingerprint and stored.source_fingerprint != old_id
    assert stored.fingerprint_version == 2
    assert test_db_session.scalars(select(TransactionTag)).one().transaction_id == old_id


def test_source_identity_survives_changed_rule_and_reupload(test_db_session, test_user):
    engine = SyncEngine(test_db_session, test_user.id)
    source = _source()
    engine.import_rows([source], "initial.csv", "initial")
    stored = test_db_session.scalars(select(Transaction)).one()
    stable_id, fingerprint = stored.transaction_id, stored.source_fingerprint
    test_db_session.add(TransactionTag(user_id=test_user.id, transaction_id=stable_id, tag="keep"))
    rule = CategorizationRule(user_id=test_user.id, pattern="purchase", category="Food")
    test_db_session.add(rule)
    test_db_session.commit()
    assert apply_rules_retroactively(test_db_session, test_user.id) == (1, 1)
    rule.category = "Shopping"
    test_db_session.commit()
    result = engine.import_rows([source], "same.csv", "second")
    assert (result.inserted, result.deleted, result.updated) == (0, 0, 1)
    stored = test_db_session.scalars(select(Transaction)).one()
    assert stored.transaction_id == stable_id
    assert stored.source_fingerprint == fingerprint
    assert stored.category == "Shopping"
    assert test_db_session.scalars(select(TransactionTag)).one().transaction_id == stable_id


def test_distinct_pipe_fields_and_reordered_snapshot_keep_identity(test_db_session, test_user):
    sources = [
        _source(note="memo|food", category="travel"),
        _source(note="memo", category="food|travel"),
    ]
    engine = SyncEngine(test_db_session, test_user.id)
    assert engine.import_rows(sources, "first.csv", "first").inserted == 2
    before = {row.transaction_id for row in test_db_session.scalars(select(Transaction))}
    second = engine.import_rows(sources[::-1], "second.csv", "second")
    assert (second.inserted, second.deleted) == (0, 0)
    assert {row.transaction_id for row in test_db_session.scalars(select(Transaction))} == before


def test_legacy_rule_category_can_be_adopted_without_raw_category(test_db_session, test_user):
    # The previous writer stored only the rule result, discarding raw category.
    legacy = _legacy(test_db_session, test_user.id, _source(category="Food"))
    old_id = legacy.transaction_id
    test_db_session.add(
        CategorizationRule(user_id=test_user.id, pattern="purchase", category="Shopping")
    )
    test_db_session.commit()
    result = SyncEngine(test_db_session, test_user.id).import_rows([_source()], "new.csv", "new")
    assert (result.inserted, result.deleted) == (0, 0)
    assert test_db_session.scalars(select(Transaction)).one().transaction_id == old_id
    assert test_db_session.scalars(select(TransactionTag)).one().transaction_id == old_id


def test_ambiguous_legacy_adoption_rejects_without_moving_annotations(test_db_session, test_user):
    _legacy(test_db_session, test_user.id, _source(category="Food"))
    _legacy(test_db_session, test_user.id, _source(category="Food"), occurrence=1)
    before = set(test_db_session.scalars(select(Transaction.transaction_id)))
    with pytest.raises(NormalizationError, match="ambiguous source identities"):
        SyncEngine(test_db_session, test_user.id).import_rows([_source()], "new.csv", "new")
    assert set(test_db_session.scalars(select(Transaction.transaction_id))) == before
    assert set(test_db_session.scalars(select(TransactionTag.transaction_id))) == before
    assert all(not row.is_deleted for row in test_db_session.scalars(select(Transaction)))


def test_rule_failure_rolls_back_entire_batch(test_db_session, test_user, monkeypatch):
    engine = SyncEngine(test_db_session, test_user.id)
    engine.import_rows([_source(), _source(amount="200.00")], "initial.csv", "initial")
    test_db_session.add(
        CategorizationRule(user_id=test_user.id, pattern="purchase", category="Shopping")
    )
    test_db_session.commit()
    before = [
        (row.transaction_id, row.category) for row in test_db_session.scalars(select(Transaction))
    ]

    def fail(*_args):
        raise RuntimeError("synthetic dimension failure")

    monkeypatch.setattr("ledger_sync.core.rules.sync_transactions_dimensions", fail)
    with pytest.raises(RuntimeError, match="synthetic dimension failure"):
        apply_rules_retroactively(test_db_session, test_user.id)
    after = [
        (row.transaction_id, row.category) for row in test_db_session.scalars(select(Transaction))
    ]
    assert after == before
