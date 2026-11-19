"""Error tracking: Sentry for FastAPI, off unless LEDGER_SYNC_SENTRY_DSN is set.

Vercel keeps runtime logs for an hour (Hobby) or a day (Pro), so a failed
recompute's error was gone before anyone looked. This is a personal finance app,
so nothing about a request or the ledger may leave for Sentry: no body, cookies,
query string, credentials headers or local variables, and no free text either.
Exception messages are cut to their type (a database error's DETAIL can hold a
failing row's amounts and notes), log breadcrumbs and extras are dropped (an
import logs its file name), log events keep only their message template, and
transaction spans lose their data and query strings. What is sent is the
exception type, its stack frames and a few harmless headers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import ledger_sync

if TYPE_CHECKING:
    from ledger_sync.config.settings import Settings

# Request headers that may stay on an event. Everything else (authorization,
# cookie, x-* tokens, forwarded addresses) is dropped.
_SAFE_HEADERS = frozenset({"user-agent", "content-type", "content-length", "accept"})

_REQUEST_KEYS_TO_DROP = ("data", "cookies", "query_string")


def _without_query(value: Any) -> Any:
    return value.split("?", 1)[0] if isinstance(value, str) else value


def scrub_event(event: Any, _hint: Any = None) -> Any:
    """Sentry before_send and before_send_transaction hook: keep only what cannot hold data."""
    request = event.get("request")
    if isinstance(request, dict):
        for key in _REQUEST_KEYS_TO_DROP:
            request.pop(key, None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                name: value for name, value in headers.items() if name.lower() in _SAFE_HEADERS
            }
        request["url"] = _without_query(request.get("url"))

    event.pop("breadcrumbs", None)
    event.pop("extra", None)

    exception = event.get("exception")
    if isinstance(exception, dict):
        for value in exception.get("values") or []:
            if isinstance(value, dict):
                value["value"] = ""

    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        event["logentry"] = {"message": logentry.get("message", "")}
        event.pop("message", None)

    for span in event.get("spans") or []:
        if isinstance(span, dict):
            span.pop("data", None)
            span["description"] = _without_query(span.get("description"))
    return event


def report_exception(exc: BaseException) -> None:
    """Send a failure the caller handled itself; a no-op while error tracking is off."""
    try:
        import sentry_sdk
    except ImportError:
        return
    sentry_sdk.capture_exception(exc)


def init_error_tracking(settings: Settings) -> bool:
    """Start Sentry when a DSN is configured; return whether it was started."""
    if settings.sentry_dsn is None:
        return False

    # Imported here so a missing package can never break startup when it is off.
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment,
        release=f"ledger-sync@{ledger_sync.__version__}",
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        before_send=scrub_event,
        before_send_transaction=scrub_event,
    )
    return True
