from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

import re

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.enums import CouponType



def _code(value: str) -> str:
    code = value.strip().upper()
    if not re.fullmatch(r"[A-Z0-9_-]{3,32}", code):
        raise ValueError("Use 3–32 letters, numbers, dashes or underscores (no spaces)")
    return code


Code = Annotated[str, AfterValidator(_code)]


class CouponIn(BaseModel):
    code: Code
    description: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)] = None
    discount_type: CouponType
    value: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] = Decimal("0")
    min_subtotal: Annotated[Decimal | None, Field(ge=0, max_digits=12, decimal_places=2)] = None
    max_discount: Annotated[Decimal | None, Field(gt=0, max_digits=12, decimal_places=2)] = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    usage_limit: Annotated[int | None, Field(gt=0)] = None
    per_customer_limit: Annotated[int | None, Field(gt=0)] = None
    is_active: bool = True

    @model_validator(mode="after")
    def check_rules(self):
        if self.discount_type == CouponType.PERCENT and not (0 < self.value <= 100):
            raise ValueError("Percentage must be between 1 and 100")
        if self.discount_type == CouponType.FIXED and self.value <= 0:
            raise ValueError("Enter the discount amount in QAR")
        if self.discount_type == CouponType.FREE_DELIVERY:
            self.value = Decimal("0")
        if self.discount_type != CouponType.PERCENT:
            self.max_discount = None
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("End date must be after the start date")
        return self


CouponState = Literal["active", "scheduled", "expired", "used_up", "inactive"]


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    description: str | None
    discount_type: CouponType
    value: Decimal
    min_subtotal: Decimal | None
    max_discount: Decimal | None
    starts_at: datetime | None
    ends_at: datetime | None
    usage_limit: int | None
    per_customer_limit: int | None
    times_used: int
    is_active: bool
    created_at: datetime
    state: CouponState = "active"
    total_savings: Decimal = Decimal("0")


class CouponRedemptionOut(BaseModel):
    order_id: int
    order_number: str
    customer_name: str
    discount_amount: Decimal
    created_at: datetime
    voided: bool


class CouponDetail(CouponOut):
    redemptions: list[CouponRedemptionOut]
