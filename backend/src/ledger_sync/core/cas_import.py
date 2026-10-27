"""Read a CAS PDF in memory with casparser.

The PDF and its password live only for this call. pypdfium2 opens the bytes from
memory (nothing touches the disk), casparser returns typed models, and
``core/cas_records.py`` keeps only what valuation and XIRR need. Nothing here logs
the file, the password or any parsed value.

casparser reads original CAMS and KFintech statements (detailed and summary) and
NSDL or CDSL demat statements. It refuses MFCentral statements and re-printed or
"Save as PDF" copies, which lose the issuer's markers, and ``_unreadable_reason``
tells those apart so the user knows which statement to request instead.

casparser and pypdfium2 load on the first upload, not at import: they take about
0.3 s to import and only this route uses them, so no other route's cold start
pays for them. PDFium is not thread-safe and ``read_cas`` runs in the thread
pool, so one parse runs at a time per process.
"""

from __future__ import annotations

import io
import threading
from typing import Any

from ledger_sync.core.cas_records import (
    DEPOSITORY_SOURCES,
    ParsedCas,
    as_date,
    demat_holdings,
    enum_name,
    rta_holdings,
)
from ledger_sync.utils.logging import logger

MAX_WARNINGS = 20
# PDFium (behind casparser and pypdfium2) shares global state between documents.
_PDFIUM_LOCK = threading.Lock()
# What a parser crash on an unexpected layout can raise besides casparser's own
# ParserException: pydantic's ValidationError is a ValueError, PdfiumError a
# RuntimeError and decimal's InvalidOperation an ArithmeticError.
_CRASHES = (
    ValueError,
    TypeError,
    KeyError,
    IndexError,
    AttributeError,
    ArithmeticError,
    RuntimeError,
)
# Producer or Creator strings of print drivers and browsers' "Save as PDF".
_PRINTERS = (
    "print to pdf",
    "skia",
    "quartz",
    "chrome",
    "mozilla",
    "ghostscript",
    "cairo",
    "printer",
)
_ISSUER_WORDS = ("cams", "kfin", "nsdl", "cdsl", "folio")

NOT_PDF = "This file is not a PDF. Upload the CAS PDF attached to the statement email."
NOT_UNLOCKED = (
    "The password did not open this PDF. A CAMS or KFintech CAS uses the password you "
    "chose when you requested it; an NSDL or CDSL CAS uses your PAN in capitals."
)
MFCENTRAL = (
    "This is an MFCentral statement, which cannot be read. Request a Detailed CAS from "
    "CAMS or KFintech and upload the PDF attached to that email."
)
REPRINTED = (
    "This looks like a re-printed or 'Save as PDF' copy of a CAS. Printing removes the "
    "issuer's markers, so the statement cannot be verified. Upload the original PDF from "
    "the CAMS, KFintech, NSDL or CDSL email."
)
NOT_CAS = "This PDF is not a CAS from CAMS, KFintech, NSDL or CDSL."
UNREADABLE = (
    "This CAS could not be read. Upload the original PDF from the statement email, or "
    "request a new statement."
)
NO_FUNDS = "This statement lists no mutual fund schemes."
UNAVAILABLE = (
    "CAS import is not available on this server yet. Your holdings are unchanged; "
    "the rest of Investment Analytics works as before."
)


class CasImportError(ValueError):
    """A statement that cannot be imported, with a message safe to show the user."""


class CasUnavailableError(RuntimeError):
    """The optional ``cas`` extra (casparser) is not installed on this server."""


# casparser's warnings use en and em dashes (U+2013, U+2014); the UI shows hyphens.
_DASHES = str.maketrans({chr(0x2013): "-", chr(0x2014): "-"})


def _plain(warning: Any) -> str:
    return str(warning).translate(_DASHES)[:500]


def _unreadable_reason(content: bytes, password: str) -> str:
    """Why casparser found no issuer: MFCentral, a re-print, or not a CAS at all."""
    import pypdfium2 as pdfium

    try:
        document = pdfium.PdfDocument(content, password=password)
    except pdfium.PdfiumError:
        return NOT_CAS
    try:
        pages = [
            document[n].get_textpage().get_text_bounded() for n in range(min(len(document), 2))
        ]
        metadata = document.get_metadata_dict()
    except _CRASHES:
        return NOT_CAS
    finally:
        document.close()
    text = "".join(" ".join(pages).lower().split())
    producer = " ".join(str(metadata.get(key, "")) for key in ("Producer", "Creator")).lower()
    printed = any(name in producer for name in _PRINTERS)
    if "mfcentral" in text:
        return MFCENTRAL
    if "consolidatedaccount" in text or (printed and any(w in text for w in _ISSUER_WORDS)):
        return REPRINTED
    return NOT_CAS


def _crash_site(error: BaseException) -> str:
    """``module:line`` of the frame that raised.

    The message stays out of the log: a parser's KeyError or ValueError can quote
    the statement's text.
    """
    frame = error.__traceback__
    while frame is not None and frame.tb_next is not None:
        frame = frame.tb_next
    if frame is None:
        return "unknown"
    return f"{frame.tb_frame.f_globals.get('__name__', '?')}:{frame.tb_lineno}"


def _unreadable(error: BaseException) -> CasImportError:
    logger.warning("CAS parse failed (%s at %s)", type(error).__name__, _crash_site(error))
    return CasImportError(UNREADABLE)


def _parse(content: bytes, password: str) -> Any:
    """casparser's model, trying the password as typed, trimmed, then in capitals.

    An NSDL or CDSL CAS opens with the PAN in capitals, which people often type
    in lower case. A variant that opens the PDF is the password, so trying it is safe.
    """
    try:
        import casparser
        from casparser.exceptions import (
            CASParseError,
            IncorrectPasswordError,
            ParserException,
        )
    except ModuleNotFoundError as error:
        # The hosted function ships without the ``cas`` extra (pyproject.toml).
        raise CasUnavailableError(UNAVAILABLE) from error

    for candidate in dict.fromkeys([password, password.strip(), password.strip().upper()]):
        try:
            return casparser.read_cas_pdf(io.BytesIO(content), candidate)
        except IncorrectPasswordError:
            continue
        except CASParseError as error:
            if "issuer" in str(error).lower():
                raise CasImportError(_unreadable_reason(content, candidate)) from error
            raise _unreadable(error) from error
        except (ParserException, *_CRASHES) as error:
            raise _unreadable(error) from error
    raise CasImportError(NOT_UNLOCKED)


def read_cas(content: bytes, password: str) -> ParsedCas:
    """Parse one CAS PDF held in memory. Raises CasImportError with a user-facing reason."""
    if b"%PDF-" not in content[:1024]:
        raise CasImportError(NOT_PDF)
    with _PDFIUM_LOCK:
        data = _parse(content, password)
    period = data.statement_period
    statement_to = as_date(period.to)
    source = enum_name(data.file_type)
    if source in DEPOSITORY_SOURCES:
        holdings = demat_holdings(data, statement_to)
        cas_type = None
        folios = len({holding.folio for holding in holdings if holding.folio})
    else:
        holdings = rta_holdings(data)
        cas_type = enum_name(data.cas_type)
        folios = len(data.folios)
    if not holdings:
        raise CasImportError(NO_FUNDS)
    return ParsedCas(
        source=source,
        cas_type=cas_type,
        statement_from=as_date(period.from_),
        statement_to=statement_to,
        folios=folios,
        holdings=tuple(holdings),
        warnings=tuple(_plain(warning) for warning in data.parse_warnings[:MAX_WARNINGS]),
    )
