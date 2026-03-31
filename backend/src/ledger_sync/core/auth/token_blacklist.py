"""In-memory token blacklist for logout invalidation.

Provides a simple TTL-based cache to blacklist revoked JWT tokens.
Tokens are automatically removed after they would have expired naturally.
A background daemon thread runs periodic cleanup every 5 minutes.

For production with multiple workers, replace with Redis-backed storage.
"""

import threading
import time

# Maximum number of entries before forced cleanup (safety cap for memory)
_MAX_ENTRIES = 10_000
_CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes


class TokenBlacklist:
    """Thread-safe in-memory token blacklist with automatic expiry cleanup."""

    def __init__(self) -> None:
        self._blacklisted: dict[str, float] = {}  # token -> expiry_timestamp
        self._lock = threading.Lock()
        self._cleanup_thread = threading.Thread(target=self._periodic_cleanup, daemon=True)
        self._cleanup_thread.start()

    def add(self, token: str, expires_in_seconds: int) -> None:
        """Add a token to the blacklist.

        Args:
            token: The JWT token string to blacklist.
            expires_in_seconds: Seconds until the token naturally expires.

        """
        with self._lock:
            self._blacklisted[token] = time.monotonic() + expires_in_seconds
            if len(self._blacklisted) > _MAX_ENTRIES:
                self._cleanup()

    def is_blacklisted(self, token: str) -> bool:
        """Check if a token has been blacklisted.

        Args:
            token: The JWT token string to check.

        Returns:
            True if the token is blacklisted and hasn't expired from the cache.

        """
        with self._lock:
            expiry = self._blacklisted.get(token)
            if expiry is None:
                return False
            if time.monotonic() > expiry:
                del self._blacklisted[token]
                return False
            return True

    def _cleanup(self) -> None:
        """Remove expired entries from the blacklist (called under lock)."""
        now = time.monotonic()
        expired = [t for t, exp in self._blacklisted.items() if now > exp]
        for t in expired:
            del self._blacklisted[t]

    def _periodic_cleanup(self) -> None:
        """Background thread: clean up expired tokens every 5 minutes."""
        while True:
            time.sleep(_CLEANUP_INTERVAL_SECONDS)
            with self._lock:
                self._cleanup()


# Global singleton
token_blacklist = TokenBlacklist()
