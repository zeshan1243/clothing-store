from datetime import date

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentAdmin, DbSession
from app.schemas.admin_orders import DashboardOut, SalesReportOut
from app.services.reporting import dashboard, sales_report

router = APIRouter(tags=["admin-reports"])

MAX_REPORT_DAYS = 366


def _check_range(date_from: date | None, date_to: date | None) -> None:
    if date_from and date_to:
        if date_to < date_from:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "End date is before start date")
        if (date_to - date_from).days > MAX_REPORT_DAYS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Date range is limited to one year")


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    db: DbSession, _: CurrentAdmin, date_from: date | None = None, date_to: date | None = None
) -> DashboardOut:
    """Defaults to today (Qatar time)."""
    _check_range(date_from, date_to)
    return dashboard(db, date_from, date_to)


@router.get("/reports/sales", response_model=SalesReportOut)
def get_sales_report(
    db: DbSession, _: CurrentAdmin, date_from: date | None = None, date_to: date | None = None
) -> SalesReportOut:
    _check_range(date_from, date_to)
    return sales_report(db, date_from, date_to)
