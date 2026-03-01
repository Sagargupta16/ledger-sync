"""Authentication service.

Encapsulates all authentication business logic including OAuth login/registration,
token management, and profile updates. OAuth-only — no email/password authentication.
"""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.auth import (
    create_tokens,
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
    UserResponse,
)

logger = logging.getLogger("ledger_sync.auth")


class AuthService:
    """Service class for authentication operations.

    OAuth-only authentication — users sign in via Google or GitHub.
    """

    def __init__(self, session: Session) -> None:
        """Initialize the auth service.

        Args:
            session: SQLAlchemy database session

        """
        self.session = session

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

    def oauth_login_or_register(
        self,
        *,
        email: str,
        full_name: str | None,
        provider: str,
        provider_id: str,
    ) -> Token:
        """Login or register a user via OAuth provider.

        If a user with this email already exists, log them in and update
        OAuth fields. If no user exists, create a new account.

        Args:
            email: Email from the OAuth provider.
            full_name: Full name from the OAuth profile.
            provider: OAuth provider name ("google" or "github").
            provider_id: Unique user ID from the provider.

        Returns:
            JWT tokens.

        """
        user = self._get_user_by_email(email)

        if user:
            # Existing user — update OAuth fields if not already set
            if not user.auth_provider:
                user.auth_provider = provider
                user.auth_provider_id = provider_id
            # Update name if it was empty
            if not user.full_name and full_name:
                user.full_name = full_name
            user.is_verified = True
            user.last_login = datetime.now(UTC)
            self.session.commit()
            logger.info("OAuth login for user_id=%s via %s", user.id, provider)
        else:
            # New user — create account (OAuth-only, no password)
            user = User(
                email=email,
                full_name=full_name,
                is_verified=True,
                auth_provider=provider,
                auth_provider_id=provider_id,
                last_login=datetime.now(UTC),
            )
            self.session.add(user)
            self.session.flush()

            # Create default preferences
            preferences = UserPreferences(user_id=user.id)
            self.session.add(preferences)
            self.session.commit()
            logger.info("New OAuth user registered: user_id=%s via %s", user.id, provider)

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
            auth_provider=user.auth_provider,
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
        """Get user by email address."""
        return self.session.execute(select(User).where(User.email == email)).scalar_one_or_none()

    def _get_user_by_id(self, user_id: int) -> User | None:
        """Get user by ID."""
        return self.session.execute(select(User).where(User.id == user_id)).scalar_one_or_none()

    def _delete_all_user_data(self, user_id: int) -> None:
        """Delete all user-scoped data across every table.

        Deletes in FK-safe order: child tables first (anomalies reference
        transactions), then transactions, then remaining tables.
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

        This action is irreversible. The user must already be authenticated.
        """
        user_id = user.id
        self._delete_all_user_data(user_id)
        self.session.delete(user)
        self.session.commit()
        logger.info("Account deleted: user_id=%s", user_id)

    def reset_account(self, user: User) -> None:
        """Reset account to fresh state, keeping the OAuth account.

        Removes all data but preserves the user account and
        creates fresh default preferences.
        """
        user_id = user.id
        self._delete_all_user_data(user_id)

        # Create fresh default preferences
        preferences = UserPreferences(user_id=user_id)
        self.session.add(preferences)

        self.session.commit()
        logger.info("Account reset: user_id=%s", user_id)
