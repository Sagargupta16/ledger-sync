"""Authentication-related Pydantic schemas.

Contains all request/response models for authentication operations.
OAuth-only authentication — no email/password endpoints.
"""

from datetime import datetime

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
    """Request model for OAuth callback with authorization code."""

    code: str = Field(..., description="Authorization code from OAuth provider")
    state: str | None = Field(None, description="CSRF state token for validation")


class OAuthProviderConfig(BaseModel):
    """OAuth provider configuration (returned to frontend)."""

    provider: str
    client_id: str
    authorize_url: str
    scope: str
    redirect_uri: str
    state: str = Field(..., description="CSRF state token to include in authorize URL")


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
