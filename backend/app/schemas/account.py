from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, EmailStr, StringConstraints, field_validator

from app.models.enums import OrderStatus, PaymentStatus
from app.schemas.orders import QatarMobile

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Short = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)]


def _blank_to_none(value: str | None) -> str | None:
    return value or None


class AddressIn(BaseModel):
    """Saved delivery address (prefills checkout; the area is checked again when ordering)."""

    area: Short = None
    zone: Short = None
    street: Short = None
    building: Short = None
    unit: Short = None
    landmark: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None
    instructions: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=1000)] = None

    _blanks = field_validator("*", mode="before")(_blank_to_none)


class RegisterIn(BaseModel):
    full_name: FullName
    phone: QatarMobile
    email: EmailStr | None = None
    password: Password

    _blank_email = field_validator("email", mode="before")(_blank_to_none)


class LoginIn(BaseModel):
    # Not validated as a Qatar number here: a typo should get the normal "incorrect" message.
    phone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=30)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ProfileOut(BaseModel):
    id: int
    full_name: str
    phone: str
    email: str | None
    default_address: AddressIn | None
    phone_verified: bool
    must_change_password: bool
    registered_at: datetime


class SessionOut(BaseModel):
    token: str
    expires_at: datetime
    customer: ProfileOut


class ProfileUpdate(BaseModel):
    full_name: FullName
    email: EmailStr | None = None
    default_address: AddressIn | None = None

    _blank_email = field_validator("email", mode="before")(_blank_to_none)


class ChangePasswordIn(BaseModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password


class AccountOrderOut(BaseModel):
    order_number: str
    public_token: str
    created_at: datetime
    order_status: OrderStatus
    payment_status: PaymentStatus
    grand_total: Decimal
    currency: str
    item_count: int
    item_names: list[str]
    image_url: str | None
