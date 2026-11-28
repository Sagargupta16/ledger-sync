"""One SlowAPI limiter with IP and account key functions.

SlowAPI marks a request as checked after the first limiter runs. Stacked
decorators must therefore register on the same instance. ``user_limiter``
preserves the account-keyed decorator API used by uploads and chat while
registering its limits on ``limiter``, which is attached to app.state.

Counters live in LEDGER_SYNC_RATE_LIMIT_STORAGE_URI (Redis) when it is set,
so every serverless instance shares them; otherwise, or while that store is
unreachable, each instance counts in memory.
"""

import hashlib
from collections.abc import Callable
from typing import Any, cast

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ledger_sync.config.settings import settings
from ledger_sync.core.auth.tokens import decode_token

# Fail fast to the in-memory fallback instead of holding a request on a slow store.
_STORAGE_TIMEOUT_SECONDS = 1


def client_ip(request: Request) -> str:
    """The caller's address, the key of every per-IP limit.

    Outside development the API runs only on Vercel, which overwrites any
    X-Forwarded-For a client sends with the real client address
    (https://vercel.com/docs/headers/request-headers), so the header is
    trusted there. Locally the socket peer is the caller.
    """
    if settings.environment != "development":
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return get_remote_address(request)


def _user_key_func(request: Request) -> str:
    """Extract stable per-user identifier from Authorization header.

    Falls back to remote address when the token is missing / malformed /
    expired so unauthenticated calls to authenticated endpoints still get
    rate-limited (they'll 401 downstream, but the limiter also protects
    the auth path).
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return client_ip(request)

    payload = decode_token(auth[7:])
    if payload is None or payload.type != "access" or not payload.sub:
        return client_ip(request)

    return f"user:{payload.sub}"


def _upload_key_func(request: Request) -> str:
    """Key an upload token by a digest of it; anything else by account or address."""
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if token.startswith("lsu_"):
        return "upload-token:" + hashlib.sha256(token.encode()).hexdigest()[:16]
    return _user_key_func(request)


def _storage_uri() -> str | None:
    """The configured store with short socket timeouts, which redis-py reads from the URI."""
    configured = settings.rate_limit_storage_uri
    if configured is None:
        return None
    uri = configured.get_secret_value()
    joiner = "&" if "?" in uri else "?"
    timeout = _STORAGE_TIMEOUT_SECONDS
    return f"{uri}{joiner}socket_connect_timeout={timeout}&socket_timeout={timeout}"


limiter = Limiter(key_func=client_ip, storage_uri=_storage_uri(), in_memory_fallback_enabled=True)


class _UserLimiter:
    """Compatible account-keyed decorators registered on the shared limiter."""

    @staticmethod
    def limit[Endpoint: Callable[..., Any]](
        limit_value: str, **options: Any
    ) -> Callable[[Endpoint], Endpoint]:
        return cast(
            Callable[[Endpoint], Endpoint],
            limiter.limit(limit_value, key_func=_user_key_func, **options),
        )


user_limiter = _UserLimiter()
