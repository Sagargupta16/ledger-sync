"""Authentication service.

Encapsulates all authentication business logic including OAuth login/registration,
token management, and profile updates. OAuth-only — no email/password authentication.
"""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ledger_sync.core.auth import verify_token
from ledger_sync.db.models import (
    User,
    UserAISettings,
    UserPreferences,
)
from ledger_sync.schemas.auth import (
    Token,
    UserResponse,
)

# Refresh rotation and account deletion/reset live in mixins beside this module.
from ledger_sync.services.auth_account_data import AccountDataMixin
from ledger_sync.services.auth_refresh import RefreshRotationMixin

logger = logging.getLogger("ledger_sync.auth")


class AuthService(RefreshRotationMixin, AccountDataMixin):
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
        """Rotate a refresh token into a new token pair.

        Every refresh token is single-use. Issued tokens carry a ``jti``
        naming an ``audit_logs`` issuance record that one atomic UPDATE marks
        consumed. Pre-rotation tokens without a ``jti`` are recorded by digest
        on first use, then rotated like any other.

        A consumed token presented again within ``_REFRESH_REUSE_GRACE_SECONDS``
        is a concurrent refresh (two tabs sharing storage, a retried request)
        and receives its own fresh pair. Later reuse means the token was copied:
        the user's ``token_version`` is bumped, revoking every session.

        Args:
            refresh_token: Valid refresh token

        Returns:
            New JWT tokens

        Raises:
            HTTPException: If refresh token is invalid, revoked, or replayed

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

        # Re-verify with the user's current token_version so a bumped tv
        # (from logout/reset) invalidates outstanding refresh tokens too --
        # the initial verify_token above didn't have expected_tv wired.
        if (
            verify_token(refresh_token, token_type="refresh", expected_tv=user.token_version)
            is None
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

        self._consume_refresh_token(user, refresh_token, token_data.jti)
        return self._issue_tokens(user)

    def oauth_login_or_register(
        self,
        *,
        email: str,
        full_name: str | None,
        provider: str,
        provider_id: str,
    ) -> Token:
        """Login or register a user via OAuth provider.

        Identity is keyed on (auth_provider, auth_provider_id), NOT on email.
        Email is only used to link a provider to a pre-existing account that
        has no provider yet (e.g. a legacy account). Silent cross-provider
        linking is refused. An email match never replaces an existing provider
        identity, including a different subject from the same provider.

        Args:
            email: Email from the OAuth provider (already provider-verified).
            full_name: Full name from the OAuth profile.
            provider: OAuth provider name ("google" or "github").
            provider_id: Unique user ID from the provider.

        Returns:
            JWT tokens.

        Raises:
            HTTPException: If the identity is missing, bound elsewhere, or inactive.

        """
        if provider not in {"google", "github"} or not provider_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The sign-in provider did not return a valid account identity.",
            )

        user = self._resolve_oauth_user(email, provider, provider_id)

        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This account is inactive.",
                )

            if user.auth_provider is None and user.auth_provider_id is None:
                # Claim legacy identities atomically, including concurrent callbacks.
                linked_id = self.session.execute(
                    update(User)
                    .where(
                        User.id == user.id,
                        User.auth_provider.is_(None),
                        User.auth_provider_id.is_(None),
                        User.is_active.is_(True),
                    )
                    .values(auth_provider=provider, auth_provider_id=provider_id)
                    .returning(User.id)
                ).scalar_one_or_none()
                if linked_id is None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This account changed during sign-in. Please start sign-in again.",
                    )
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
            self.session.add(UserAISettings(user_id=user.id))
            self.session.commit()
            logger.info("New OAuth user registered: user_id=%s via %s", user.id, provider)

        return self._issue_tokens(user)

    def logout(self, user: User) -> None:
        """Invalidate all outstanding tokens for this user.

        Bumps ``token_version`` so any JWT carrying the previous ``tv`` fails
        the check in ``get_current_user`` / ``refresh_tokens``. One integer
        write does what a per-token blocklist would need N rows for.
        """
        user.token_version += 1
        self.session.commit()
        logger.info("Logout: bumped token_version for user_id=%s", user.id)

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

    def _resolve_oauth_user(self, email: str, provider: str, provider_id: str) -> User | None:
        """Find the provider identity or an unbound legacy account with the verified email."""
        user = self._get_user_by_provider(provider, provider_id)
        if user is not None:
            return user

        # Only a fully unbound legacy account can be linked by verified email.
        user = self._get_user_by_email(email)
        if user is not None and (
            user.auth_provider is not None or user.auth_provider_id is not None
        ):
            logger.warning(
                "OAuth login refused: email belongs to a bound identity",
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This email is already linked to another sign-in identity. "
                    "Please sign in with the account originally used for Ledger Sync."
                ),
            )
        return user

    def _get_user_by_provider(self, provider: str, provider_id: str) -> User | None:
        """Get user by OAuth provider identity (the authoritative login key)."""
        if not provider_id:
            return None
        return self.session.execute(
            select(User).where(
                User.auth_provider == provider,
                User.auth_provider_id == provider_id,
            )
        ).scalar_one_or_none()

    def _get_user_by_id(self, user_id: int) -> User | None:
        """Get user by ID."""
        return self.session.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
