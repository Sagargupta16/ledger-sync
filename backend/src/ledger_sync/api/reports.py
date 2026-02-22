"""Reports API endpoints - Monthly financial report generation."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.report_generator import (
    generate_html_report,
    query_report_data,
    report_data_to_dict,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/monthly")
def get_monthly_report(
    current_user: CurrentUser,
    db: DatabaseSession,
    year: Annotated[int, Query(..., ge=2000, le=2100, description="Report year")],
    month: Annotated[int, Query(..., ge=1, le=12, description="Report month (1-12)")],
    format: Annotated[
        str,
        Query(pattern="^(html|json)$", description="Output format"),
    ] = "html",
) -> Any:
    """Generate a monthly financial report.

    Returns either an HTML page (suitable for printing to PDF) or raw JSON data.

    Args:
        current_user: Authenticated user
        db: Database session
        year: The year for the report
        month: The month for the report (1-12)
        format: Output format - "html" for printable report, "json" for raw data

    Returns:
        HTMLResponse with formatted report, or JSON dict with report data

    """
    report_data = query_report_data(db, current_user, year, month)

    if format == "json":
        return report_data_to_dict(report_data)

    html_content = generate_html_report(report_data)
    return HTMLResponse(content=html_content)
