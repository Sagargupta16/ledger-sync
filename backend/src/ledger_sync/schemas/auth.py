"""Authentication-related Pydantic schemas.

Contains all request/response models for authentication operations.
OAuth-only authentication — no email/password endpoints.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Token Schemas
# =============================================================================


class TokenData(BaseModel):
    """Extracted token data after verification."""

    user_id: int | None = None
    email: str | None = None


class Token(BaseModel):
    """Token response model returned after successful authentication."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    sub: str  # user_id as string
    email: str
    exp: datetime
    type: str  # "access" or "refresh"
    tv: int | None = None  # token_version, None on pre-2026-07 tokens (soft-accept)


class RefreshTokenRequest(BaseModel):
    """Request model for token refresh."""

    refresh_token: str


# =============================================================================
# User Schemas
# =============================================================================


class UserResponse(BaseModel):
    """User response model (public user data)."""

    id: int
    email: str
    full_name: str | None = None
    is_active: bool
    is_verified: bool
    auth_provider: str | None = None
    created_at: str
    last_login: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """User profile update request."""

    full_name: str | None = None


# =============================================================================
# OAuth Schemas
# =============================================================================


class OAuthCallbackRequest(BaseModel):
    """Authorization code and proof retained by the initiating browser tab."""

    code: str = Field(..., min_length=1, max_length=2048)
    state: str = Field(..., min_length=1, max_length=512, pattern=r"^[A-Za-z0-9_.-]+$")
    code_verifier: str = Field(
        ...,
        min_length=43,
        max_length=128,
        pattern=r"^[A-Za-z0-9._~-]+$",
        description="PKCE verifier from this tab, never included in the redirect URL",
    )


class OAuthInitiationRequest(BaseModel):
    """Start a sign-in using the browser's S256 PKCE challenge."""

    code_challenge: str = Field(..., min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")


class OAuthProviderConfig(BaseModel):
    """OAuth provider configuration (returned to frontend)."""

    provider: Literal["google", "github"]
    client_id: str
    authorize_url: str
    scope: str
    redirect_uri: str
    flow_version: Literal[2] = 2


class OAuthRestartConfig(OAuthProviderConfig):
    """Legacy clients navigate to a restart bridge, never an unbound login."""

    state: Literal["oauth-upgrade-v2"] = "oauth-upgrade-v2"


class OAuthAuthorization(OAuthProviderConfig):
    """One sign-in attempt bound to a provider, redirect, and PKCE challenge."""

    state: str
    code_challenge: str
    code_challenge_method: Literal["S256"] = "S256"
    expires_in: int


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
