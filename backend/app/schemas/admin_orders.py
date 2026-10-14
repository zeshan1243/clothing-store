from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import OrderStatus, PaymentStatus, PaymentType

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]
Note = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=1000)]


class AdminRef(BaseModel):
    id: int
    name: str


class OrderListItem(BaseModel):
    id: int
    order_number: str
    created_at: datetime
    customer_name: str
    customer_phone: str
    delivery_area: str
    item_count: int
    grand_total: Decimal
    amount_paid: Decimal
    order_status: OrderStatus
    payment_status: PaymentStatus
    assigned_admin: AdminRef | None


class OrderListPage(BaseModel):
    items: list[OrderListItem]
    total: int
    page: int
    page_size: int


class AdminOrderItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_variant_id: int | None
    product_id: int | None
    product_name: str
    sku: str
    colour: str
    size: str
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class PaymentOut(BaseModel):
    id: int
    type: PaymentType
    amount: Decimal
    currency: str
    method: str
    collected_at: datetime
    reference: str | None
    notes: str | None
    recorded_by: AdminRef | None
    created_at: datetime


class StatusHistoryOut(BaseModel):
    id: int
    old_status: OrderStatus | None
    new_status: OrderStatus
    note: str | None
    changed_by: AdminRef | None
    created_at: datetime


class AdminOrderDetail(BaseModel):
    id: int
    order_number: str
    public_token: str
    created_at: datetime
    updated_at: datetime
    customer_id: int
    customer_name: str
    customer_phone: str
    customer_email: str | None
    delivery_area: str
    delivery_distance_km: int | None = None
    delivery_zone: str | None
    delivery_street: str | None
    delivery_building: str | None
    delivery_unit: str | None
    delivery_landmark: str | None
    delivery_instructions: str | None
    customer_notes: str | None
    internal_notes: str | None
    items: list[AdminOrderItem]
    subtotal: Decimal
    delivery_fee: Decimal
    discount_amount: Decimal
    coupon_code: str | None = None
    tax_amount: Decimal
    grand_total: Decimal
    currency: str
    payment_method: str
    payment_status: PaymentStatus
    order_status: OrderStatus
    amount_collected: Decimal
    amount_refunded: Decimal
    balance_due: Decimal
    assigned_admin: AdminRef | None
    cancellation_reason: str | None
    delivery_failure_reason: str | None
    confirmed_at: datetime | None
    delivered_at: datetime | None
    cancelled_at: datetime | None
    payments: list[PaymentOut]
    history: list[StatusHistoryOut]
    allowed_transitions: list[OrderStatus]
    customer_order_count: int


class ConfirmIn(BaseModel):
    note: Note = None


class StatusChangeIn(BaseModel):
    status: OrderStatus
    note: Note = None
    # Required when moving to CANCELLED or DELIVERY_FAILED.
    reason: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=1000)] = None
    # When marking DELIVERED: also record the outstanding balance as collected in cash.
    collect_cash: bool = False


class CancelIn(BaseModel):
    reason: Reason


class AssignIn(BaseModel):
    admin_id: int | None


class NotesIn(BaseModel):
    internal_notes: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=5000)] = None


class PaymentIn(BaseModel):
    type: Literal[PaymentType.COD_COLLECTION, PaymentType.REFUND]
    amount: Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
    collected_at: datetime | None = None
    reference: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    notes: Note = None


# ---------- Dashboard & reports ----------


class LowStockItem(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    sku: str
    colour: str
    size: str
    available_quantity: int


class CurrencyAmount(BaseModel):
    currency: str
    amount: Decimal


class DashboardOut(BaseModel):
    date_from: date
    date_to: date
    # Current workload (all time).
    orders_new: int
    orders_awaiting_delivery: int
    orders_out_for_delivery: int
    orders_delivery_failed: int
    # Period figures (orders created / payments recorded within the period).
    orders_placed: int
    orders_delivered: int
    orders_cancelled: int
    gross_order_value: Decimal
    cancelled_order_value: Decimal
    cash_collected: Decimal
    refunds_paid: Decimal
    net_cash: Decimal
    # Point-in-time balances.
    cod_outstanding: Decimal
    cod_outstanding_orders: int
    low_stock_count: int
    low_stock: list[LowStockItem]
    supplier_outstanding: list[CurrencyAmount]


class SalesReportRow(BaseModel):
    day: date
    orders_placed: int
    gross_order_value: Decimal
    orders_cancelled: int
    cancelled_order_value: Decimal
    orders_delivered: int
    delivered_order_value: Decimal
    orders_failed: int
    cash_collected: Decimal
    refunds_paid: Decimal


class StatusCount(BaseModel):
    status: OrderStatus
    count: int
    value: Decimal


class SalesReportOut(BaseModel):
    date_from: date
    date_to: date
    rows: list[SalesReportRow]
    totals: SalesReportRow
    by_status: list[StatusCount]
