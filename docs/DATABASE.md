# Database Schema & Models

## Overview

Ledger Sync uses SQLite with SQLAlchemy 2.0 ORM (Mapped types). The database stores financial transactions with multi-user support, and includes models for analytics, budgets, anomalies, and net worth tracking.

## Database Models

### Transaction Model

Represents a single financial transaction (income, expense, or transfer). Uses SHA-256 hash as the primary key for deduplication.

```python
class Transaction(Base):
    __tablename__ = "transactions"

    # Primary key is the SHA-256 hash (no separate auto-increment ID)
    transaction_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Core fields
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False, index=True)

    # Categorization
    account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Transfer-specific
    from_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    to_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    is_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Optional
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
```

**Transaction Types** (enum): `Expense`, `Income`, `Transfer`

**Table Schema:**

| Column           | Type            | Constraints | Index | Description                      |
| ---------------- | --------------- | ----------- | ----- | -------------------------------- |
| transaction_id   | VARCHAR(64)     | PRIMARY KEY | YES   | SHA-256 hash (dedup + PK)        |
| user_id          | INTEGER         | FOREIGN KEY | YES   | Owning user                      |
| date             | TIMESTAMP       | NOT NULL    | YES   | Transaction date                 |
| amount           | DECIMAL(15,2)   | NOT NULL    | NO    | Transaction amount               |
| currency         | VARCHAR(10)     | DEFAULT INR | NO    | Currency code                    |
| type             | ENUM            | NOT NULL    | YES   | Expense / Income / Transfer      |
| account          | VARCHAR(255)    | NOT NULL    | YES   | Account name                     |
| category         | VARCHAR(255)    | NOT NULL    | YES   | Category                         |
| subcategory      | VARCHAR(255)    | NULL        | NO    | Sub-category                     |
| from_account     | VARCHAR(255)    | NULL        | YES   | Transfer source account          |
| to_account       | VARCHAR(255)    | NULL        | YES   | Transfer destination account     |
| is_transfer      | BOOLEAN         | DEFAULT 0   | NO    | Transfer flag                    |
| note             | TEXT            | NULL        | NO    | Transaction note                 |
| source_file      | VARCHAR(500)    | NOT NULL    | NO    | Source Excel filename            |
| last_seen_at     | TIMESTAMP       | NOT NULL    | YES   | Last import time                 |
| is_deleted       | BOOLEAN         | DEFAULT 0   | YES   | Soft delete flag                 |

**Composite Indexes:**

```sql
ix_transactions_date_type (date, type)
ix_transactions_category_subcategory (category, subcategory)
ix_transactions_user_date (user_id, date)
ix_transactions_user_deleted (user_id, is_deleted)
ix_transactions_user_type_deleted (user_id, type, is_deleted)
ix_transactions_user_category (user_id, category)
ix_transactions_user_date_type (user_id, date, type)
```

### Other Models

The database also includes these models (see `backend/src/ledger_sync/db/models.py`):

- **User** — Authentication with hashed passwords and JWT tokens
- **UserPreferences** — Fiscal year, essential categories, income classifications, anomaly thresholds
- **AccountClassification** — User-defined account type mappings (Bank, Investment, Credit Card, etc.)
- **MonthlySummary** — Pre-calculated monthly income/expense/savings aggregations
- **CategoryTrend** — Category-level trends over time periods
- **TransferFlow** — Aggregated transfer flows between accounts
- **RecurringTransaction** — Detected recurring patterns (SIPs, subscriptions, salaries)
- **MerchantIntelligence** — Extracted merchant data from transaction notes
- **NetWorthSnapshot** — Point-in-time net worth with asset/liability breakdown
- **FYSummary** — Fiscal year summaries with YoY changes
- **Anomaly** — Detected anomalies (high expenses, budget exceeded)
- **Budget** — User-defined budget limits per category
- **AuditLog** — Operation audit trail

## Database Operations

### Create (Insert)

Insert a new transaction:

```python
transaction = Transaction(
    hash_id="abc123...",
    date=datetime(2025, 1, 15),
    amount=5000.00,
    type="Expense",
    category="Groceries",
    account="Checking",
    description="Weekly groceries",
    file_source="MoneyManager.xlsx"
)
session.add(transaction)
session.commit()
```

### Read (Query)

Get transactions by various criteria:

```python
# Get all transactions
all_txns = session.query(Transaction).all()

# Get by date range
txns = session.query(Transaction).filter(
    Transaction.date >= start_date,
    Transaction.date <= end_date
).all()

# Get by category
category_txns = session.query(Transaction).filter(
    Transaction.category == "Rent"
).all()

# Get non-deleted transactions
active = session.query(Transaction).filter(
    Transaction.is_deleted == False
).all()

# Get by hash_id (for deduplication check)
existing = session.query(Transaction).filter(
    Transaction.hash_id == hash_id
).first()

# Aggregations
from sqlalchemy import func
total_income = session.query(func.sum(Transaction.amount)).filter(
    Transaction.type == "Income"
).scalar()
```

### Update

Update an existing transaction:

```python
transaction = session.query(Transaction).filter(
    Transaction.hash_id == hash_id
).first()

if transaction:
    transaction.category = "Groceries"
    transaction.amount = 5500.00
    transaction.updated_at = datetime.utcnow()
    session.commit()
```

### Delete (Soft)

Mark transaction as deleted instead of removing:

```python
transaction = session.query(Transaction).filter(
    Transaction.hash_id == hash_id
).first()

if transaction:
    transaction.is_deleted = True
    transaction.updated_at = datetime.utcnow()
    session.commit()
```

## Migrations (Alembic)

### Create a New Migration

```bash
alembic revision --autogenerate -m "Add new field to transactions"
```

This creates a migration file in `alembic/versions/`.

### Apply Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Apply specific migration
alembic upgrade abc123def456

# Rollback one migration
alembic downgrade -1

# Rollback all
alembic downgrade base
```

### Migration Files

Migration files are Python scripts that define `upgrade()` and `downgrade()` functions:

```python
def upgrade() -> None:
    op.add_column('transactions',
        sa.Column('new_field', sa.String(100), nullable=True)
    )

def downgrade() -> None:
    op.drop_column('transactions', 'new_field')
```

## Hash ID Generation

Transaction IDs are generated using SHA-256 hash of:

```python
hash_input = f"{date}|{amount}|{category}|{account}"
hash_id = hashlib.sha256(hash_input.encode()).hexdigest()
```

**Benefits:**

- Deterministic: Same transaction always generates same ID
- No central ID service needed
- Collision resistant (SHA-256)
- Enables file re-import without duplicates

## Data Integrity

### Constraints

1. **Unique hash_id** - No duplicate transactions
2. **Non-null date** - Every transaction must have a date
3. **Non-null amount** - Every transaction must have an amount
4. **Non-null type** - Transaction type is required

### Cascading Deletes

Currently, no foreign keys (no cascading deletes).

### Audit Trail

- `created_at` - When record was created
- `updated_at` - When record was last modified
- `is_deleted` - Soft delete instead of hard delete
- `last_import_time` - When transaction was last imported

## Performance Optimization

### Current Indexes

- `hash_id` - O(1) lookup for duplicates
- `date` - Fast range queries
- `category` - Fast filtering by category
- `account` - Fast filtering by account
- `is_deleted` - Fast filtering of active records
- `(user_id, category)` - Fast per-user category aggregation
- `(user_id, date, type)` - Fast per-user time-range + type filtering

### Query Optimization Strategies

1. **Use indexes** - Always filter by indexed columns
2. **Avoid full table scans** - Use WHERE clauses
3. **Limit results** - Use LIMIT for pagination
4. **Batch operations** - Use bulk_insert for large imports
5. **Connection pooling** - Reuse database connections

### Example Optimized Query

```python
# Instead of this (full table scan)
all_txns = session.query(Transaction).all()
rent = [t for t in all_txns if t.category == "Rent"]

# Do this (indexed query)
rent = session.query(Transaction).filter(
    Transaction.category == "Rent",
    Transaction.is_deleted == False
).all()
```

## Backup & Recovery

### Backup

```bash
# Copy SQLite database file
cp ledger_sync.db ledger_sync.db.backup

# Or with timestamp
cp ledger_sync.db "ledger_sync.db.$(date +%Y%m%d_%H%M%S).backup"
```

### Restore

```bash
# Restore from backup
cp ledger_sync.db.backup ledger_sync.db
```

### SQLite Backup Command

```bash
sqlite3 ledger_sync.db ".backup ledger_sync.db.backup"
```

## Database Maintenance

### Check Database Integrity

```bash
sqlite3 ledger_sync.db "PRAGMA integrity_check;"
```

### Vacuum (Optimize)

```bash
# Reclaim space and optimize
sqlite3 ledger_sync.db "VACUUM;"
```

### Analyze Statistics

```bash
# Update query optimizer statistics
sqlite3 ledger_sync.db "ANALYZE;"
```

## Future Enhancements

### Scaling to PostgreSQL

PostgreSQL is supported out of the box. The application auto-detects the database type from `DATABASE_URL` and applies the appropriate configuration:

- **SQLite**: WAL mode, 64MB cache, NORMAL sync, foreign keys enabled
- **PostgreSQL**: Connection pooling (pool_size=20, max_overflow=10, pool_pre_ping=True)

For high-availability production deployments:

1. Set `LEDGER_SYNC_DATABASE_URL` to a PostgreSQL connection string
2. Add replication for high availability
3. Implement partitioning for large tables

### Sample PostgreSQL Migration

```python
# Change DATABASE_URL
# postgresql://user:password@localhost/ledger_sync

# SQLAlchemy automatically uses PostgreSQL features
```

### Additional Tables (Future)

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True)
    email = Column(String(100), unique=True)

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    user_id = Column(Integer, ForeignKey("users.id"))

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    type = Column(String(20))  # Income, Expense
```

## Connection String

### SQLite (default)

```
sqlite:///ledger_sync.db
```

### PostgreSQL

```
postgresql://username:password@localhost:5432/ledger_sync
```

## Database Configuration

Environment variables (in `.env`):

```bash
DATABASE_URL=sqlite:///ledger_sync.db
DB_ECHO=False  # Log SQL queries (set to True for debugging)
```

## Transactions & Sessions

### SQLAlchemy Session Management

```python
from ledger_sync.db.session import SessionLocal

def process_transactions(transactions):
    session = SessionLocal()
    try:
        for txn in transactions:
            session.add(txn)
        session.commit()
    except Exception as e:
        session.rollback()
        raise
    finally:
        session.close()
```

### Context Manager Pattern

```python
from contextlib import contextmanager

@contextmanager
def get_db():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()

# Usage
with get_db() as db:
    db.add(transaction)
```
