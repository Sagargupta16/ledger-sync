"""Authentication-related Pydantic schemas.

Contains all request/response models for authentication operations.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

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


class UserRegister(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str | None = None


class UserLogin(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User response model (public user data)."""

    id: int
    email: str
    full_name: str | None
    is_active: bool
    is_verified: bool
    created_at: str
    last_login: str | None

    class Config:
        """Pydantic config."""

        from_attributes = True


class UserUpdate(BaseModel):
    """User profile update request."""

    full_name: str | None = None


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
