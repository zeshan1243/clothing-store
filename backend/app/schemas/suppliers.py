import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.models.enums import SupplierBillStatus



def _currency_code(value: str) -> str:
    code = value.strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", code):
        raise ValueError("Use a 3-letter currency code, e.g. PKR or QAR")
    return code


Currency = Annotated[str, AfterValidator(_currency_code)]
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
OptText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=2000)]


class SupplierIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    phone: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=30)] = None
    email: EmailStr | None = None
    default_currency: Currency = "PKR"
    payment_terms: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None
    notes: OptText = None
    is_active: bool = True

    _blank_email = field_validator("email", mode="before")(lambda v: v or None)


class CurrencyBalance(BaseModel):
    currency: str
    billed: Decimal
    paid: Decimal
    outstanding: Decimal
    overdue: Decimal


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str | None
    email: str | None
    default_currency: str
    payment_terms: str | None
    notes: str | None
    is_active: bool
    balances: list[CurrencyBalance] = []
    open_bills: int = 0


class BillItemIn(BaseModel):
    product_variant_id: int | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    quantity: int = Field(gt=0, le=100000)
    unit_cost: Annotated[Decimal | None, Field(ge=0, max_digits=12, decimal_places=2)] = None


class SupplierBillIn(BaseModel):
    supplier_id: int
    supplier_reference: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    bill_date: date
    due_date: date | None = None
    description: OptText = None
    currency: Currency
    total_amount: Amount
    notes: OptText = None
    items: list[BillItemIn] = Field(default=[], max_length=200)
    # Add linked items to stock immediately (goods already in hand).
    receive_now: bool = False

    @model_validator(mode="after")
    def check_dates(self):
        if self.due_date and self.due_date < self.bill_date:
            raise ValueError("Due date can't be before the bill date")
        return self


class SupplierBillUpdate(BaseModel):
    supplier_reference: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    due_date: date | None = None
    description: OptText = None
    notes: OptText = None


class BillItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_variant_id: int | None
    sku: str | None = None
    description: str
    quantity: int
    quantity_received: int
    unit_cost: Decimal | None


class SupplierPaymentIn(BaseModel):
    amount: Amount
    paid_at: datetime | None = None
    # Optional QAR equivalent: give the rate (1 bill-currency unit = X QAR) or the QAR amount.
    exchange_rate_to_qar: Annotated[Decimal | None, Field(gt=0, max_digits=18, decimal_places=8)] = None
    amount_qar: Annotated[Decimal | None, Field(gt=0, max_digits=12, decimal_places=2)] = None
    payment_reference: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    notes: OptText = None


class SupplierPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: Decimal
    currency: str
    exchange_rate_to_qar: Decimal | None
    amount_qar: Decimal | None
    paid_at: datetime
    payment_reference: str | None
    notes: str | None
    recorded_by: str | None = None


class ReceiveLineIn(BaseModel):
    item_id: int
    quantity: int = Field(gt=0)


class ReceiveIn(BaseModel):
    lines: list[ReceiveLineIn] = Field(min_length=1)


class SupplierBillListItem(BaseModel):
    id: int
    supplier_id: int
    supplier_name: str
    supplier_reference: str | None
    bill_date: date
    due_date: date | None
    currency: str
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    status: SupplierBillStatus
    is_overdue: bool
    items_pending: int


class SupplierBillDetail(SupplierBillListItem):
    description: str | None
    notes: str | None
    items: list[BillItemOut]
    payments: list[SupplierPaymentOut]
    created_by: str | None
    created_at: datetime
