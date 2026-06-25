"""Shared rate limiter.

A single Limiter instance is shared across all routers and attached to
``app.state.limiter`` in main.py. slowapi's ``_rate_limit_exceeded_handler``
reads ``request.app.state.limiter`` to inject Retry-After / rate-limit headers;
if no limiter is attached it raises AttributeError and the 429 surfaces as a
generic 500. Sharing one instance keeps the decorator config and the handler
in sync.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
