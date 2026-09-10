"""One SlowAPI limiter with IP and account key functions.

SlowAPI marks a request as checked after the first limiter runs. Stacked
decorators must therefore register on the same instance. ``user_limiter``
preserves the account-keyed decorator API used by uploads and chat while
registering its limits on ``limiter``, which is attached to app.state.
"""

from collections.abc import Callable
from typing import Any, cast

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ledger_sync.core.auth.tokens import decode_token


def _user_key_func(request: Request) -> str:
    """Extract stable per-user identifier from Authorization header.

    Falls back to remote address when the token is missing / malformed /
    expired so unauthenticated calls to authenticated endpoints still get
    rate-limited (they'll 401 downstream, but the limiter also protects
    the auth path).
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return get_remote_address(request)

    payload = decode_token(auth[7:])
    if payload is None or payload.type != "access" or not payload.sub:
        return get_remote_address(request)

    return f"user:{payload.sub}"


limiter = Limiter(key_func=get_remote_address)


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
