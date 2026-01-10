# Database Schema & Models

## Overview

Ledger Sync uses SQLite with SQLAlchemy ORM. The database stores financial transactions, accounts, and metadata for reconciliation and analytics.

## Database Models

### Transaction Model

Represents a single financial transaction (income, expense, transfer).

```python
class Transaction(Base):
    __tablename__ = "transactions"

    # Primary Key
    id = Column(Integer, primary_key=True)

    # Content Fields
    hash_id = Column(String(64), unique=True, index=True)  # SHA-256 hash
    date = Column(DateTime, index=True)
    amount = Column(Numeric(12, 2))
    type = Column(String(20))  # Income, Expense, Transfer, Reimbursement, Investment
    category = Column(String(100), index=True)
    subcategory = Column(String(100), nullable=True)
    account = Column(String(100), index=True)
    description = Column(String(255), nullable=True)

    # Metadata Fields
    file_source = Column(String(255))  # Source filename
    is_deleted = Column(Boolean, default=False, index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_import_time = Column(DateTime, nullable=True)
```

**Table Schema:**

| Column           | Type          | Constraints | Index | Description                    |
| ---------------- | ------------- | ----------- | ----- | ------------------------------ |
| id               | INTEGER       | PRIMARY KEY |       | Auto-increment ID              |
| hash_id          | TEXT(64)      | UNIQUE      | YES   | SHA-256 hash for deduplication |
| date             | TIMESTAMP     |             | YES   | Transaction date               |
| amount           | DECIMAL(12,2) |             | NO    | Transaction amount             |
| type             | VARCHAR(20)   |             | NO    | Income/Expense/Transfer/etc    |
| category         | VARCHAR(100)  |             | YES   | Spending category              |
| subcategory      | VARCHAR(100)  | NULL        | NO    | Sub-category                   |
| account          | VARCHAR(100)  |             | YES   | Account name                   |
| description      | TEXT          | NULL        | NO    | Transaction description        |
| file_source      | VARCHAR(255)  |             | NO    | Source file name               |
| is_deleted       | BOOLEAN       | DEFAULT 0   | YES   | Soft delete flag               |
| created_at       | TIMESTAMP     | DEFAULT NOW | YES   | Insert timestamp               |
| updated_at       | TIMESTAMP     | DEFAULT NOW | NO    | Update timestamp               |
| last_import_time | TIMESTAMP     | NULL        | NO    | Last import time               |

**Indexes:**

- `hash_id` - Fast duplicate detection
- `date` - Range queries
- `category` - Category analysis
- `account` - Account filtering
- `is_deleted` - Exclude deleted records
- `created_at` - Time-based sorting

### Composite Indexes (future optimization)

```sql
CREATE INDEX idx_date_category ON transactions(date, category);
CREATE INDEX idx_account_type ON transactions(account, type);
CREATE INDEX idx_date_type ON transactions(date, type);
```

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

For multi-user or high-volume scenarios:

1. Replace SQLite with PostgreSQL
2. Add connection pooling (pgBouncer)
3. Add replication for high availability
4. Implement partitioning for large tables

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

### SQLite

```
sqlite:///ledger_sync.db
```

### PostgreSQL (future)

```
postgresql://username:password@localhost:5432/ledger_sync
```

### MySQL (future)

```
mysql+pymysql://username:password@localhost:3306/ledger_sync
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
