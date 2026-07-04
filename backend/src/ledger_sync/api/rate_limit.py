"""Shared rate limiters (IP-keyed + user-keyed).

Two Limiter instances are exported:

- ``limiter`` — IP-keyed via ``get_remote_address``. Attached to
  ``app.state.limiter`` in main.py so slowapi's
  ``_rate_limit_exceeded_handler`` can read ``request.app.state.limiter``
  to inject Retry-After / rate-limit headers. Use for pre-auth endpoints
  (OAuth callback, refresh) where the caller has no verified identity yet.

- ``user_limiter`` — keyed on the JWT ``sub`` claim from the Authorization
  header, falling back to remote address if the token is missing or invalid.
  Use for authenticated endpoints where per-user limits are the correct
  granularity (upload, AI chat). Behind CGNAT / carrier NAT, IP-keyed
  limits bucket-share across every user on the same egress -- user-keyed
  limits isolate per account.

Decorators stack: ``@user_limiter.limit(...)`` alongside ``@limiter.limit(...)``
evaluates both independently; whichever trips first returns 429.
"""

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
    if payload is None or not payload.sub:
        return get_remote_address(request)

    return f"user:{payload.sub}"


limiter = Limiter(key_func=get_remote_address)
user_limiter = Limiter(key_func=_user_key_func)
