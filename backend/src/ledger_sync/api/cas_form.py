"""Read a small multipart/form-data body that is already in memory.

FastAPI's ``UploadFile`` needs python-multipart, which is not a dependency, and
Starlette spools a file over 1 MB to a temporary file on disk. The CAS upload
must never touch the disk, so the bounded body is split here instead (RFC 7578:
parts between ``--boundary`` delimiters, headers, a blank line, then the bytes).
"""

from __future__ import annotations

import re

_BOUNDARY_RE = re.compile(r'boundary=(?:"([^"]+)"|([^;\s]+))', re.IGNORECASE)
_PARAM_RE = re.compile(r';\s*([\w*-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]*))')
_MAX_PARTS = 8


class FormError(ValueError):
    """The body is not the multipart form the route expects."""


def _boundary(content_type: str) -> bytes:
    match = _BOUNDARY_RE.search(content_type)
    if not content_type.lower().startswith("multipart/form-data") or match is None:
        raise FormError("Send the statement as multipart/form-data.")
    boundary = (match.group(1) or match.group(2)).encode("latin-1", errors="replace")
    if not 1 <= len(boundary) <= 70:
        raise FormError("The form boundary is invalid.")
    return boundary


def _headers(block: bytes) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in block.decode("utf-8", errors="replace").split("\r\n"):
        name, separator, value = line.partition(":")
        if not separator:
            raise FormError("A form part has a malformed header.")
        headers[name.strip().lower()] = value.strip()
    return headers


def parse_multipart(body: bytes, content_type: str) -> dict[str, bytes]:
    """Each part's bytes by field name. Raises FormError on anything but a well-formed form."""
    delimiter = b"\r\n--" + _boundary(content_type)
    sections = (b"\r\n" + body).split(delimiter)
    parts: dict[str, bytes] = {}
    for section in sections[1:]:
        if section.startswith(b"--"):
            return parts  # the closing delimiter
        line_end = section.find(b"\r\n")
        if line_end < 0 or section[:line_end].strip(b" \t"):
            raise FormError("The form body is malformed.")
        head, separator, data = section[line_end + 2 :].partition(b"\r\n\r\n")
        if not separator:
            raise FormError("A form part has no body.")
        disposition = _headers(head).get("content-disposition", "")
        # findall gives "" for the alternative that did not match.
        params = {
            key.lower(): quoted or bare for key, quoted, bare in _PARAM_RE.findall(disposition)
        }
        name = params.get("name")
        if not disposition.lower().startswith("form-data") or not name:
            raise FormError("A form part has no field name.")
        if name in parts or len(parts) >= _MAX_PARTS:
            raise FormError("The form repeats a field or has too many fields.")
        parts[name] = data
    raise FormError("The form body ended early.")
