"""Authentication service.

Encapsulates all authentication business logic including user registration,
login, token management, and profile updates.
"""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.auth import (
    create_tokens,
    get_password_hash,
    verify_password,
    verify_token,
)
from ledger_sync.db.models import (
    AccountClassification,
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
    ScheduledTransaction,
    TaxRecord,
    Transaction,
    TransferFlow,
    User,
    UserPreferences,
)
from ledger_sync.schemas.auth import (
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)

logger = logging.getLogger("ledger_sync.auth")


class AuthService:
    """Service class for authentication operations.

    Encapsulates business logic for user authentication, registration,
    and token management.
    """

    def __init__(self, session: Session) -> None:
        """Initialize the auth service.

        Args:
            session: SQLAlchemy database session

        """
        self.session = session

    def register(self, data: UserRegister) -> Token:
        """Register a new user.

        Args:
            data: User registration data

        Returns:
            JWT tokens for the new user

        Raises:
            HTTPException: If email already exists

        """
        # Check if email already exists
        existing_user = self._get_user_by_email(data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        # Create new user
        user = User(
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            last_login=datetime.now(UTC),
        )
        self.session.add(user)
        self.session.flush()  # Get user.id without committing

        # Create default preferences for the user
        preferences = UserPreferences(user_id=user.id)
        self.session.add(preferences)
        self.session.commit()

        logger.info("New user registered: user_id=%s", user.id)
        return create_tokens(user.id, user.email)

    def login(self, data: UserLogin) -> Token:
        """Authenticate user and return tokens.

        Uses constant-time comparison to prevent user enumeration
        via timing attacks (CWE-208).

        Args:
            data: User login credentials

        Returns:
            JWT tokens if authentication successful

        Raises:
            HTTPException: If credentials are invalid

        """
        user = self._get_user_by_email(data.email)

        if user:
            password_valid = verify_password(data.password, user.hashed_password)
        else:
            # Always run a hash to prevent timing-based user enumeration
            get_password_hash(data.password)
            password_valid = False

        if not user or not password_valid:
            logger.warning("Failed login attempt for email: %s", data.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        # Update last login
        user.last_login = datetime.now(UTC)
        self.session.commit()

        logger.info("Successful login for user_id=%s", user.id)
        return create_tokens(user.id, user.email)

    def refresh_tokens(self, refresh_token: str) -> Token:
        """Refresh access token using refresh token.

        Args:
            refresh_token: Valid refresh token

        Returns:
            New JWT tokens

        Raises:
            HTTPException: If refresh token is invalid

        """
        token_data = verify_token(refresh_token, token_type="refresh")

        if token_data is None or token_data.user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = self._get_user_by_id(token_data.user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        return create_tokens(user.id, user.email)

    def get_user_response(self, user: User) -> UserResponse:
        """Convert User model to response schema.

        Args:
            user: User database model

        Returns:
            UserResponse schema

        """
        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None,
        )

    def update_profile(self, user: User, full_name: str | None) -> User:
        """Update user profile.

        Args:
            user: Current user
            full_name: New full name (or None to keep existing)

        Returns:
            Updated user

        """
        if full_name is not None:
            user.full_name = full_name
            self.session.commit()
            self.session.refresh(user)
        return user

    def _get_user_by_email(self, email: str) -> User | None:
        """Get user by email address.

        Args:
            email: Email to search for

        Returns:
            User if found, None otherwise

        """
        return self.session.execute(select(User).where(User.email == email)).scalar_one_or_none()

    def _get_user_by_id(self, user_id: int) -> User | None:
        """Get user by ID.

        Args:
            user_id: User ID to search for

        Returns:
            User if found, None otherwise

        """
        return self.session.execute(select(User).where(User.id == user_id)).scalar_one_or_none()

    def verify_password_or_raise(self, user: User, password: str) -> None:
        """Verify the user's password, raising 403 if incorrect.

        Args:
            user: The authenticated user.
            password: The plaintext password to verify.

        Raises:
            HTTPException: If the password does not match.

        """
        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Incorrect password",
            )

    def _delete_all_user_data(self, user_id: int) -> None:
        """Delete all user-scoped data across every table.

        Deletes in FK-safe order: child tables first (anomalies reference
        transactions), then transactions, then remaining tables.

        Args:
            user_id: ID of the user whose data to delete.

        """
        # Tables with FK to transactions — must be deleted first
        self.session.query(Anomaly).filter(Anomaly.user_id == user_id).delete()

        # Core data tables (no FK dependencies on each other)
        self.session.query(Transaction).filter(Transaction.user_id == user_id).delete()
        self.session.query(ImportLog).filter(ImportLog.user_id == user_id).delete()
        self.session.query(RecurringTransaction).filter(
            RecurringTransaction.user_id == user_id
        ).delete()
        self.session.query(ScheduledTransaction).filter(
            ScheduledTransaction.user_id == user_id
        ).delete()

        # Analytics / aggregation tables
        self.session.query(MonthlySummary).filter(MonthlySummary.user_id == user_id).delete()
        self.session.query(CategoryTrend).filter(CategoryTrend.user_id == user_id).delete()
        self.session.query(TransferFlow).filter(TransferFlow.user_id == user_id).delete()
        self.session.query(NetWorthSnapshot).filter(NetWorthSnapshot.user_id == user_id).delete()
        self.session.query(MerchantIntelligence).filter(
            MerchantIntelligence.user_id == user_id
        ).delete()
        self.session.query(FYSummary).filter(FYSummary.user_id == user_id).delete()
        self.session.query(TaxRecord).filter(TaxRecord.user_id == user_id).delete()

        # Budgets & goals
        self.session.query(Budget).filter(Budget.user_id == user_id).delete()
        self.session.query(FinancialGoal).filter(FinancialGoal.user_id == user_id).delete()

        # Account classifications
        self.session.query(AccountClassification).filter(
            AccountClassification.user_id == user_id
        ).delete()

        # User preferences
        self.session.query(UserPreferences).filter(UserPreferences.user_id == user_id).delete()

    def delete_account(self, user: User) -> None:
        """Permanently delete a user account and all associated data.

        This action is irreversible and removes all user data
        across every table, then deletes the user account itself.

        Args:
            user: User to delete

        """
        user_id = user.id
        self._delete_all_user_data(user_id)

        # Delete the user
        self.session.delete(user)
        self.session.commit()
        logger.info("Account deleted: user_id=%s", user_id)

    def reset_account(self, user: User) -> None:
        """Reset account to fresh state, keeping login credentials.

        Removes all data across every table but preserves the user
        account and creates fresh default preferences.

        Args:
            user: User to reset

        """
        user_id = user.id
        self._delete_all_user_data(user_id)

        # Create fresh default preferences
        preferences = UserPreferences(user_id=user_id)
        self.session.add(preferences)

        self.session.commit()
        logger.info("Account reset: user_id=%s", user_id)
