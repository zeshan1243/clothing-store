"""Dashboard and report figures.

Definitions (shown to admins so totals aren't confused):
- Gross order value: grand totals of orders *placed* in the period, including ones later cancelled.
- Cancelled value: grand totals of orders *cancelled* in the period.
- Delivered value: grand totals of orders *delivered* in the period.
- Cash collected / refunds: payments *recorded* in the period (by collection date).
- COD outstanding: balance still to collect on orders out for delivery, delivered or with a return
  requested, at the time of the request.
None of these is profit.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, func, literal_column, select
from sqlalchemy.orm import Session

from app.models import Order, OrderStatusHistory, Payment, Product, ProductVariant, SupplierBill
from app.models.enums import OrderStatus as S
from app.models.enums import PaymentType, ProductStatus
from app.models.mixins import ZERO
from app.schemas.admin_orders import (
    CurrencyAmount,
    DashboardOut,
    LowStockItem,
    SalesReportOut,
    SalesReportRow,
    StatusCount,
)
from app.services.inventory import low_stock_threshold
from app.services.numbering import QATAR_TZ

OUTSTANDING_STATUSES = (S.OUT_FOR_DELIVERY, S.DELIVERED, S.RETURN_REQUESTED)


def qatar_day_range(date_from: date | None, date_to: date | None) -> tuple[datetime, datetime]:
    """[start, end) in Qatar time covering whole days from date_from to date_to inclusive."""
    today = datetime.now(QATAR_TZ).date()
    start_day = date_from or today
    end_day = date_to or today
    start = datetime.combine(start_day, time.min, tzinfo=QATAR_TZ)
    end = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=QATAR_TZ)
    return start, end


def _qatar_day(column):
    # A literal (not a bound parameter) so SELECT and GROUP BY render identically.
    return cast(func.timezone(literal_column("'Asia/Qatar'"), column), Date)


def _daily(db: Session, column, value, start: datetime, end: datetime, *where) -> dict[date, tuple[int, Decimal]]:
    day = _qatar_day(column)
    rows = db.execute(
        select(day, func.count(), func.coalesce(func.sum(value), 0))
        .where(column >= start, column < end, *where)
        .group_by(day)
    ).all()
    return {d: (count, Decimal(total)) for d, count, total in rows}


def _sum(daily: dict[date, tuple[int, Decimal]]) -> tuple[int, Decimal]:
    return sum(c for c, _ in daily.values()), sum((v for _, v in daily.values()), ZERO)


def cod_outstanding(db: Session) -> tuple[Decimal, int]:
    collected = func.coalesce(
        select(func.sum(Payment.amount))
        .where(Payment.order_id == Order.id, Payment.type == PaymentType.COD_COLLECTION)
        .correlate(Order)
        .scalar_subquery(),
        0,
    )
    refunded = func.coalesce(
        select(func.sum(Payment.amount))
        .where(Payment.order_id == Order.id, Payment.type == PaymentType.REFUND)
        .correlate(Order)
        .scalar_subquery(),
        0,
    )
    balance = Order.grand_total - (collected - refunded)
    total, count = db.execute(
        select(func.coalesce(func.sum(balance), 0), func.count())
        .where(Order.order_status.in_(OUTSTANDING_STATUSES), balance > 0)
    ).one()
    return Decimal(total), count


def low_stock(db: Session, limit: int = 10) -> tuple[int, list[LowStockItem]]:
    variants = db.execute(
        select(ProductVariant, Product.name)
        .join(Product)
        .where(ProductVariant.is_active.is_(True), Product.status == ProductStatus.ACTIVE)
        .order_by(ProductVariant.stock_quantity - ProductVariant.reserved_quantity, Product.name)
    ).all()
    low = [
        LowStockItem(
            variant_id=v.id,
            product_id=v.product_id,
            product_name=name,
            sku=v.sku,
            colour=v.colour,
            size=v.size,
            available_quantity=v.available_quantity,
        )
        for v, name in variants
        if v.available_quantity <= low_stock_threshold(v)
    ]
    return len(low), low[:limit]


def supplier_outstanding(db: Session) -> list[CurrencyAmount]:
    rows = db.execute(
        select(SupplierBill.currency, func.sum(SupplierBill.total_amount - SupplierBill.paid_amount))
        .group_by(SupplierBill.currency)
        .having(func.sum(SupplierBill.total_amount - SupplierBill.paid_amount) > 0)
        .order_by(SupplierBill.currency)
    ).all()
    return [CurrencyAmount(currency=c, amount=Decimal(a)) for c, a in rows]


def dashboard(db: Session, date_from: date | None, date_to: date | None) -> DashboardOut:
    start, end = qatar_day_range(date_from, date_to)
    counts = dict(db.execute(select(Order.order_status, func.count()).group_by(Order.order_status)).all())

    placed = _sum(_daily(db, Order.created_at, Order.grand_total, start, end))
    delivered = _sum(_daily(db, Order.delivered_at, Order.grand_total, start, end))
    cancelled = _sum(_daily(db, Order.cancelled_at, Order.grand_total, start, end))
    collected = _sum(_daily(db, Payment.collected_at, Payment.amount, start, end, Payment.type == PaymentType.COD_COLLECTION))
    refunds = _sum(_daily(db, Payment.collected_at, Payment.amount, start, end, Payment.type == PaymentType.REFUND))
    outstanding, outstanding_orders = cod_outstanding(db)
    low_count, low_items = low_stock(db)

    return DashboardOut(
        date_from=start.date(),
        date_to=(end - timedelta(days=1)).date(),
        orders_new=counts.get(S.PLACED, 0),
        orders_awaiting_delivery=counts.get(S.CONFIRMED, 0) + counts.get(S.PREPARING, 0),
        orders_out_for_delivery=counts.get(S.OUT_FOR_DELIVERY, 0),
        orders_delivery_failed=counts.get(S.DELIVERY_FAILED, 0),
        orders_placed=placed[0],
        orders_delivered=delivered[0],
        orders_cancelled=cancelled[0],
        gross_order_value=placed[1],
        cancelled_order_value=cancelled[1],
        cash_collected=collected[1],
        refunds_paid=refunds[1],
        net_cash=collected[1] - refunds[1],
        cod_outstanding=outstanding,
        cod_outstanding_orders=outstanding_orders,
        low_stock_count=low_count,
        low_stock=low_items,
        supplier_outstanding=supplier_outstanding(db),
    )


def sales_report(db: Session, date_from: date | None, date_to: date | None) -> SalesReportOut:
    start, end = qatar_day_range(date_from, date_to)
    placed = _daily(db, Order.created_at, Order.grand_total, start, end)
    cancelled = _daily(db, Order.cancelled_at, Order.grand_total, start, end)
    delivered = _daily(db, Order.delivered_at, Order.grand_total, start, end)
    failed = {
        d: c
        for d, (c, _) in _daily(
            db, OrderStatusHistory.created_at, OrderStatusHistory.id, start, end,
            OrderStatusHistory.new_status == S.DELIVERY_FAILED,
        ).items()
    }
    collected = _daily(db, Payment.collected_at, Payment.amount, start, end, Payment.type == PaymentType.COD_COLLECTION)
    refunds = _daily(db, Payment.collected_at, Payment.amount, start, end, Payment.type == PaymentType.REFUND)

    empty = (0, ZERO)
    rows: list[SalesReportRow] = []
    day = start.date()
    last = (end - timedelta(days=1)).date()
    while day <= last:
        rows.append(
            SalesReportRow(
                day=day,
                orders_placed=placed.get(day, empty)[0],
                gross_order_value=placed.get(day, empty)[1],
                orders_cancelled=cancelled.get(day, empty)[0],
                cancelled_order_value=cancelled.get(day, empty)[1],
                orders_delivered=delivered.get(day, empty)[0],
                delivered_order_value=delivered.get(day, empty)[1],
                orders_failed=failed.get(day, 0),
                cash_collected=collected.get(day, empty)[1],
                refunds_paid=refunds.get(day, empty)[1],
            )
        )
        day += timedelta(days=1)

    totals: dict[str, Decimal | int] = defaultdict(int)
    for row in rows:
        for key, value in row.model_dump(exclude={"day"}).items():
            totals[key] += value
    totals_row = SalesReportRow(day=last, **totals)

    by_status = [
        StatusCount(status=s, count=c, value=Decimal(v))
        for s, c, v in db.execute(
            select(Order.order_status, func.count(), func.coalesce(func.sum(Order.grand_total), 0))
            .where(Order.created_at >= start, Order.created_at < end)
            .group_by(Order.order_status)
        ).all()
    ]
    by_status.sort(key=lambda r: list(S).index(r.status))
    return SalesReportOut(
        date_from=start.date(), date_to=last, rows=rows, totals=totals_row, by_status=by_status
    )
