"""Demo user data seeder for showcasing the application.

Creates a demo user with 1000+ realistic Indian finance transactions
spanning 5 years (2021-2026), covering salary growth, varied expenses,
investments, transfers, and credit card usage.
"""

import hashlib
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ledger_sync.core.auth.passwords import get_password_hash
from ledger_sync.db.models import (
    AccountClassification,
    AccountType,
    Anomaly,
    Budget,
    CategoryTrend,
    FinancialGoal,
    FYSummary,
    ImportLog,
    MerchantIntelligence,
    MonthlySummary,
    NetWorthSnapshot,
    RecurringTransaction,
    Transaction,
    TransactionType,
    TransferFlow,
    User,
    UserPreferences,
)

# ---------------------------------------------------------------------------
# Demo user credentials
# ---------------------------------------------------------------------------

DEMO_EMAIL = "demo@ledger-sync.app"
DEMO_PASSWORD = "demo1234"
DEMO_FULL_NAME = "Demo User"

# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

ACCOUNTS = {
    "HDFC Bank": AccountType.BANK_ACCOUNTS,
    "SBI Savings": AccountType.BANK_ACCOUNTS,
    "Cash": AccountType.CASH,
    "ICICI Credit Card": AccountType.CREDIT_CARDS,
    "Paytm Wallet": AccountType.OTHER_WALLETS,
    "Groww": AccountType.INVESTMENTS,
    "PPF Account": AccountType.INVESTMENTS,
}

# ---------------------------------------------------------------------------
# Transaction templates
# ---------------------------------------------------------------------------

# (category, subcategory, account, amount_range, note_templates)
MONTHLY_EXPENSES: list[tuple[str, str, str, tuple[int, int], list[str]]] = [
    ("Housing", "Rent", "HDFC Bank", (12000, 18000), ["Monthly rent", "House rent"]),
    ("Housing", "Maintenance", "HDFC Bank", (1500, 3000), ["Society maintenance"]),
    ("Utilities", "Electricity", "HDFC Bank", (800, 2500), ["Electricity bill", "BESCOM bill"]),
    ("Utilities", "Internet", "HDFC Bank", (699, 999), ["Airtel broadband", "Jio fiber"]),
    ("Utilities", "Mobile", "HDFC Bank", (299, 599), ["Jio recharge", "Airtel recharge"]),
    ("Food & Dining", "Groceries", "HDFC Bank", (3000, 6000), ["BigBasket", "DMart", "Zepto groceries"]),
    ("Food & Dining", "Groceries", "Cash", (500, 2000), ["Vegetable market", "Local grocery"]),
    ("Food & Dining", "Restaurants", "ICICI Credit Card", (500, 2500), ["Swiggy order", "Zomato", "Dinner out"]),
    ("Transportation", "Fuel", "HDFC Bank", (2000, 4000), ["Petrol", "HP petrol pump"]),
    ("Transportation", "Cab", "Paytm Wallet", (200, 800), ["Uber ride", "Ola auto", "Rapido"]),
    ("Entertainment", "Subscriptions", "ICICI Credit Card", (199, 199), ["Netflix subscription"]),
    ("Entertainment", "Subscriptions", "HDFC Bank", (119, 119), ["Spotify premium"]),
    ("Entertainment", "Subscriptions", "HDFC Bank", (149, 149), ["YouTube premium"]),
    ("Personal Care", "Salon", "Cash", (300, 800), ["Haircut", "Salon visit"]),
    ("Healthcare", "Medicines", "Cash", (100, 500), ["Pharmacy", "Apollo pharmacy"]),
]

# Expenses that happen a few times per month
FREQUENT_EXPENSES: list[tuple[str, str, str, tuple[int, int], list[str]]] = [
    ("Food & Dining", "Snacks & Drinks", "Cash", (50, 300), ["Tea/coffee", "Chai", "Juice"]),
    ("Food & Dining", "Restaurants", "Paytm Wallet", (150, 600), ["Swiggy", "Zomato quick"]),
    ("Transportation", "Metro/Bus", "Cash", (30, 100), ["Metro card recharge", "Bus ticket"]),
    ("Shopping", "Online Shopping", "ICICI Credit Card", (200, 1500), ["Amazon", "Flipkart"]),
]

# Quarterly or occasional expenses
OCCASIONAL_EXPENSES: list[tuple[str, str, str, tuple[int, int], list[str], int]] = [
    ("Healthcare", "Doctor", "HDFC Bank", (500, 2000), ["Doctor visit", "Consultation"], 3),
    ("Healthcare", "Insurance", "HDFC Bank", (5000, 12000), ["Health insurance premium"], 12),
    ("Shopping", "Clothing", "ICICI Credit Card", (1500, 5000), ["Myntra", "Ajio", "Clothes"], 3),
    ("Shopping", "Electronics", "ICICI Credit Card", (2000, 15000), ["Electronics", "Headphones", "Gadget"], 6),
    ("Education", "Books", "HDFC Bank", (300, 1500), ["Amazon books", "Technical book"], 4),
    ("Education", "Courses", "ICICI Credit Card", (500, 5000), ["Udemy course", "Coursera"], 6),
    ("Gifts & Donations", "Gifts", "HDFC Bank", (500, 3000), ["Birthday gift", "Wedding gift"], 3),
    ("Gifts & Donations", "Donations", "HDFC Bank", (500, 2000), ["Charity donation"], 6),
    ("Insurance", "Life Insurance", "HDFC Bank", (8000, 15000), ["LIC premium"], 12),
    ("Insurance", "Vehicle Insurance", "HDFC Bank", (5000, 10000), ["Car insurance renewal"], 12),
    ("Personal Care", "Gym", "HDFC Bank", (1000, 2000), ["Gym membership"], 3),
    ("Household", "Repairs", "Cash", (500, 3000), ["Plumber", "Electrician", "Home repair"], 4),
]

# Annual travel expenses
TRAVEL_TEMPLATES: list[tuple[str, tuple[int, int], list[str]]] = [
    ("Domestic", (5000, 25000), ["Goa trip", "Kerala trip", "Rajasthan trip", "Manali trip"]),
    ("Transport", (2000, 10000), ["Train tickets", "Flight booking", "Bus tickets"]),
    ("Hotels", (3000, 15000), ["Hotel booking", "OYO stay", "Airbnb"]),
]

# Transfer templates
TRANSFER_TEMPLATES: list[tuple[str, str, str, str, tuple[int, int], list[str]]] = [
    ("Transfer", "Investment", "HDFC Bank", "Groww", (3000, 10000), ["SIP investment", "Mutual fund SIP"]),
    ("Transfer", "Savings", "HDFC Bank", "SBI Savings", (5000, 20000), ["Transfer to savings"]),
    ("Transfer", "Savings", "HDFC Bank", "PPF Account", (2000, 5000), ["PPF contribution"]),
    ("Transfer", "ATM Withdrawal", "HDFC Bank", "Cash", (2000, 10000), ["ATM withdrawal"]),
    ("Transfer", "Card Payment", "HDFC Bank", "ICICI Credit Card", (5000, 25000), ["Credit card bill payment"]),
    ("Transfer", "Wallet", "HDFC Bank", "Paytm Wallet", (500, 3000), ["Paytm top-up"]),
]


# ---------------------------------------------------------------------------
# Helper: deterministic hash ID
# ---------------------------------------------------------------------------


def _make_hash_id(user_id: int, date: datetime, amount: Decimal, account: str, note: str,
                  category: str, subcategory: str | None, tx_type: str, idx: int = 0) -> str:
    """Generate a deterministic transaction hash ID."""
    raw = (
        f"{user_id}|{date.isoformat()}|{amount:.2f}|{account.strip().lower()}|"
        f"{(note or '').strip().lower()}|{category.strip().lower()}|"
        f"{(subcategory or '').strip().lower()}|{tx_type.strip().lower()}"
    )
    if idx > 0:
        raw += f"|{idx}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------


def _salary_for_month(year: int, month: int) -> int:
    """Return a realistic monthly salary that grows over time."""
    # Base salary in 2021: ~40,000. Grows ~15% per year.
    base = 40000
    years_from_start = (year - 2021) + (month - 1) / 12.0
    return int(base * (1.15 ** years_from_start))


def _rent_for_month(year: int) -> int:
    """Return rent that increases yearly."""
    base = 12000
    return base + (year - 2021) * 1500


def seed_demo_data(db: Session, user: User) -> int:
    """Seed demo transactions for the given user.

    Returns the number of transactions created.
    """
    rng = random.Random(42)  # Deterministic for reproducibility
    transactions: list[Transaction] = []
    user_id = user.id

    start_year = 2021
    end_year = 2026
    end_month = 2  # Up to Feb 2026

    for year in range(start_year, end_year + 1):
        last_month = end_month if year == end_year else 12
        for month in range(1, last_month + 1):
            month_start = datetime(year, month, 1, tzinfo=UTC)

            # --- INCOME ---

            # Salary (1st of month)
            salary = _salary_for_month(year, month)
            dt = month_start.replace(day=rng.randint(1, 3))
            transactions.append(_make_txn(
                user_id, dt, salary, "HDFC Bank", "Salary",
                "Salary", "Monthly Salary", TransactionType.INCOME,
                f"Salary credited - {dt.strftime('%b %Y')}", len(transactions),
            ))

            # Occasional freelance (10% chance per month)
            if rng.random() < 0.10:
                fl_amt = rng.randint(5000, 20000)
                dt = month_start.replace(day=rng.randint(10, 25))
                transactions.append(_make_txn(
                    user_id, dt, fl_amt, "HDFC Bank", "Freelance",
                    "Freelance", "Project Work", TransactionType.INCOME,
                    rng.choice(["Freelance project", "Consulting fee", "Side gig payment"]),
                    len(transactions),
                ))

            # Investment returns (quarterly, Jan/Apr/Jul/Oct)
            if month in (1, 4, 7, 10):
                div_amt = rng.randint(500, 3000)
                dt = month_start.replace(day=rng.randint(15, 28))
                transactions.append(_make_txn(
                    user_id, dt, div_amt, "Groww", "Investment",
                    "Investment Returns", "Dividend", TransactionType.INCOME,
                    "Mutual fund dividend", len(transactions),
                ))

            # Interest (quarterly, Mar/Jun/Sep/Dec)
            if month in (3, 6, 9, 12):
                int_amt = rng.randint(200, 1500)
                dt = month_start.replace(day=rng.randint(25, 28))
                transactions.append(_make_txn(
                    user_id, dt, int_amt, "SBI Savings", "Interest",
                    "Interest", "Bank Interest", TransactionType.INCOME,
                    "Savings account interest", len(transactions),
                ))

            # Annual bonus (March)
            if month == 3:
                bonus = int(salary * rng.uniform(0.5, 1.5))
                dt = month_start.replace(day=rng.randint(15, 25))
                transactions.append(_make_txn(
                    user_id, dt, bonus, "HDFC Bank", "Salary",
                    "Salary", "Bonus", TransactionType.INCOME,
                    f"Annual bonus - FY{year - 1}-{str(year)[2:]}", len(transactions),
                ))

            # Cashback (20% chance)
            if rng.random() < 0.20:
                cb = rng.randint(50, 500)
                dt = month_start.replace(day=rng.randint(5, 28))
                transactions.append(_make_txn(
                    user_id, dt, cb,
                    rng.choice(["ICICI Credit Card", "Paytm Wallet"]),
                    "Cashback", "Cashback", "Reward", TransactionType.INCOME,
                    rng.choice(["Cashback reward", "Card reward points", "Paytm cashback"]),
                    len(transactions),
                ))

            # --- MONTHLY EXPENSES ---
            for cat, subcat, acct, (lo, hi), notes in MONTHLY_EXPENSES:
                # Rent grows with year
                if subcat == "Rent":
                    amt = _rent_for_month(year)
                else:
                    amt = rng.randint(lo, hi)
                day = rng.randint(1, 28)
                dt = month_start.replace(day=day)
                transactions.append(_make_txn(
                    user_id, dt, amt, acct, cat,
                    cat, subcat, TransactionType.EXPENSE,
                    rng.choice(notes), len(transactions),
                ))

            # --- FREQUENT EXPENSES (2-4 times per month) ---
            for cat, subcat, acct, (lo, hi), notes in FREQUENT_EXPENSES:
                count = rng.randint(2, 4)
                for _ in range(count):
                    amt = rng.randint(lo, hi)
                    day = rng.randint(1, 28)
                    dt = month_start.replace(day=day)
                    transactions.append(_make_txn(
                        user_id, dt, amt, acct, cat,
                        cat, subcat, TransactionType.EXPENSE,
                        rng.choice(notes), len(transactions),
                    ))

            # --- OCCASIONAL EXPENSES ---
            for cat, subcat, acct, (lo, hi), notes, freq_months in OCCASIONAL_EXPENSES:
                if rng.randint(1, freq_months) == 1:
                    amt = rng.randint(lo, hi)
                    day = rng.randint(1, 28)
                    dt = month_start.replace(day=day)
                    transactions.append(_make_txn(
                        user_id, dt, amt, acct, cat,
                        cat, subcat, TransactionType.EXPENSE,
                        rng.choice(notes), len(transactions),
                    ))

            # --- TRAVEL (2-3 trips per year, clustered in certain months) ---
            if month in (1, 5, 10, 12) and rng.random() < 0.6:
                for trip_cat, (lo, hi), notes in TRAVEL_TEMPLATES:
                    amt = rng.randint(lo, hi)
                    day = rng.randint(1, 28)
                    dt = month_start.replace(day=day)
                    transactions.append(_make_txn(
                        user_id, dt, amt,
                        rng.choice(["HDFC Bank", "ICICI Credit Card"]),
                        "Travel", "Travel", trip_cat, TransactionType.EXPENSE,
                        rng.choice(notes), len(transactions),
                    ))

            # --- TRANSFERS ---
            for cat, subcat, from_acct, to_acct, (lo, hi), notes in TRANSFER_TEMPLATES:
                # SIP and savings transfers happen every month
                if subcat in ("Investment", "Savings"):
                    amt = rng.randint(lo, hi)
                    day = rng.randint(3, 10)
                    dt = month_start.replace(day=day)
                    transactions.append(_make_transfer(
                        user_id, dt, amt, from_acct, to_acct,
                        cat, subcat, rng.choice(notes), len(transactions),
                    ))
                # ATM/card/wallet transfers happen most months
                elif rng.random() < 0.7:
                    amt = rng.randint(lo, hi)
                    day = rng.randint(1, 28)
                    dt = month_start.replace(day=day)
                    transactions.append(_make_transfer(
                        user_id, dt, amt, from_acct, to_acct,
                        cat, subcat, rng.choice(notes), len(transactions),
                    ))

    # Bulk insert
    db.add_all(transactions)
    db.flush()

    # Seed account classifications
    for acct_name, acct_type in ACCOUNTS.items():
        db.merge(AccountClassification(
            user_id=user_id,
            account_name=acct_name,
            account_type=acct_type,
        ))

    # Seed user preferences
    _seed_preferences(db, user_id)

    db.flush()
    return len(transactions)


def _make_txn(
    user_id: int, date: datetime, amount: int, account: str,
    category_for_hash: str, category: str, subcategory: str,
    tx_type: TransactionType, note: str, idx: int,
) -> Transaction:
    """Create a Transaction object."""
    amt = Decimal(str(amount))
    return Transaction(
        transaction_id=_make_hash_id(
            user_id, date, amt, account, note,
            category, subcategory, tx_type.value, idx,
        ),
        user_id=user_id,
        date=date,
        amount=amt,
        currency="INR",
        type=tx_type,
        account=account,
        category=category,
        subcategory=subcategory,
        note=note,
        source_file="demo-data",
        is_deleted=False,
    )


def _make_transfer(
    user_id: int, date: datetime, amount: int,
    from_account: str, to_account: str,
    category: str, subcategory: str, note: str, idx: int,
) -> Transaction:
    """Create a Transfer transaction."""
    amt = Decimal(str(amount))
    return Transaction(
        transaction_id=_make_hash_id(
            user_id, date, amt, from_account, note,
            category, subcategory, TransactionType.TRANSFER.value, idx,
        ),
        user_id=user_id,
        date=date,
        amount=amt,
        currency="INR",
        type=TransactionType.TRANSFER,
        account=from_account,
        from_account=from_account,
        to_account=to_account,
        category=category,
        subcategory=subcategory,
        note=note,
        source_file="demo-data",
        is_deleted=False,
    )


def _seed_preferences(db: Session, user_id: int) -> None:
    """Set up demo user preferences."""
    import json

    existing = db.query(UserPreferences).filter_by(user_id=user_id).first()
    if existing:
        existing.fiscal_year_start_month = 4
        existing.essential_categories = json.dumps([
            "Housing", "Utilities", "Food & Dining", "Healthcare",
            "Transportation", "Insurance", "Education",
        ])
        existing.number_format = "indian"
        existing.currency_symbol = "\u20b9"
        existing.default_time_range = "all_time"
        existing.earning_start_date = "2021-01-01"
        existing.use_earning_start_date = True
        existing.savings_goal_percent = 30.0
        existing.payday = 1
    else:
        db.add(UserPreferences(
            user_id=user_id,
            fiscal_year_start_month=4,
            essential_categories=json.dumps([
                "Housing", "Utilities", "Food & Dining", "Healthcare",
                "Transportation", "Insurance", "Education",
            ]),
            number_format="indian",
            currency_symbol="\u20b9",
            default_time_range="all_time",
            earning_start_date="2021-01-01",
            use_earning_start_date=True,
            savings_goal_percent=30.0,
            payday=1,
        ))


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


def get_or_create_demo_user(db: Session) -> User:
    """Find the demo user or create one."""
    user = db.query(User).filter_by(email=DEMO_EMAIL).first()
    if user:
        return user

    user = User(
        email=DEMO_EMAIL,
        hashed_password=get_password_hash(DEMO_PASSWORD),
        full_name=DEMO_FULL_NAME,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def reset_demo_user(db: Session, user: User) -> dict[str, Any]:
    """Wipe all demo user data and reseed with fresh transactions.

    Returns a summary dict with counts.
    """
    uid = user.id

    # Delete all user-scoped data (order matters for FK constraints)
    for model in (
        Anomaly,
        RecurringTransaction,
        MerchantIntelligence,
        TransferFlow,
        CategoryTrend,
        MonthlySummary,
        FYSummary,
        NetWorthSnapshot,
        Budget,
        FinancialGoal,
        ImportLog,
        AccountClassification,
        Transaction,
    ):
        db.execute(delete(model).where(model.user_id == uid))

    # Delete preferences separately (no user_id column pattern)
    db.execute(delete(UserPreferences).where(UserPreferences.user_id == uid))

    db.flush()

    # Reseed
    count = seed_demo_data(db, user)
    db.commit()

    return {"transactions_seeded": count}
