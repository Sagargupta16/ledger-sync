"""Per-transaction text embeddings for semantic search (Titan Text Embeddings V2).

One row per embedded transaction: the vector of "note | category | subcategory
| account" (never amounts or dates) and the SHA-256 of that exact text plus the
model, so a changed row is embedded again and an unchanged one never is. Rows
exist only after the user starts indexing (opt-in) and go with their
transaction or their user (both foreign keys cascade).

Storage is dialect-aware. PostgreSQL keeps a pgvector ``vector(512)`` and
searches with an exact ``<=>`` scan filtered by ``user_id`` (no approximate
index, so no tenant shares a graph with another). SQLite keeps little-endian
float32 bytes and ranks with numpy. The migration creates the ``vector``
extension on PostgreSQL only; the ``before_create`` hook below does the same
for ``metadata.create_all`` so bootstrap and test schemas work as well.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import numpy as np
from numpy.typing import NDArray
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Connection,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    LargeBinary,
    String,
    Table,
    UniqueConstraint,
    event,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator, TypeEngine

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

#: Titan Text Embeddings V2 accepts 256, 512 or 1024. AWS measured that 512
#: keeps about 99% of the 1024-dimension accuracy at half the storage (AWS News
#: Blog, "Amazon Titan Text Embeddings V2 now available in Amazon Bedrock").
EMBEDDING_DIMENSIONS = 512


class EmbeddingVector(TypeDecorator[NDArray[np.float32]]):
    """``vector(n)`` on PostgreSQL, little-endian float32 bytes elsewhere."""

    impl = LargeBinary
    cache_ok = True

    def __init__(self, dimensions: int) -> None:
        super().__init__()
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[Any]:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dimensions))
        return dialect.type_descriptor(LargeBinary())

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        vector = np.asarray(value, dtype=np.float32)
        if vector.shape != (self.dimensions,) or not np.isfinite(vector).all():
            raise ValueError(f"An embedding must be {self.dimensions} finite numbers.")
        if dialect.name == "postgresql":
            return vector.tolist()
        return vector.astype("<f4").tobytes()

    def process_result_value(self, value: Any, dialect: Dialect) -> NDArray[np.float32] | None:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return np.asarray(value, dtype=np.float32)
        return np.frombuffer(value, dtype="<f4").astype(np.float32)

    def compare_values(self, x: Any, y: Any) -> bool:
        # ``==`` on two arrays is elementwise; change tracking needs one answer.
        if x is None or y is None:
            return x is y
        return bool(np.array_equal(np.asarray(x), np.asarray(y)))


class TransactionEmbedding(Base):
    """The embedding of one transaction's descriptive text."""

    __tablename__ = "transaction_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )
    transaction_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # Bedrock model ID that produced the vector; searches compare like with like.
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    # SHA-256 hex of model, dimensions and the embedded text.
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[NDArray[np.float32]] = mapped_column(
        EmbeddingVector(EMBEDDING_DIMENSIONS), nullable=False
    )
    embedded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "transaction_id"],
            ["transactions.user_id", "transactions.transaction_id"],
            name="fk_transaction_embeddings_user_transaction",
            ondelete="CASCADE",
        ),
        # Leads with user_id: the B-tree behind every user-scoped exact scan.
        UniqueConstraint(
            "user_id", "transaction_id", name="uq_transaction_embeddings_user_transaction"
        ),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<TransactionEmbedding(txn={self.transaction_id[:8]}..., model={self.model!r})>"


@event.listens_for(TransactionEmbedding.__table__, "before_create")
def _create_vector_extension(_table: Table, connection: Connection, **_kw: Any) -> None:
    """``metadata.create_all`` on PostgreSQL needs the type before the table.

    The Alembic revision runs its own guarded CREATE EXTENSION; SQLite skips both.
    The extension installs into the first schema of the search_path. If it already
    lives in a schema this connection cannot see (a test schema next to a migrated
    ``public``), say so here rather than failing on ``type "vector" does not exist``.
    """
    if connection.dialect.name != "postgresql":
        return
    connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    if connection.exec_driver_sql("SELECT to_regtype('vector')").scalar() is None:
        home = connection.exec_driver_sql(
            "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
            "WHERE e.extname = 'vector'"
        ).scalar()
        raise RuntimeError(
            f"The pgvector extension is installed in schema {home!r}, which is not on this "
            "connection's search_path, so the vector type cannot be found. Drop it there "
            "(DROP EXTENSION vector CASCADE) or add that schema to the search_path."
        )
