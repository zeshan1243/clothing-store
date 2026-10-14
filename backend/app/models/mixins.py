from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import DateTime, Enum, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

# Money is always stored as an exact decimal; never use floats for monetary values.
Money = Numeric(12, 2)
ZERO = Decimal("0.00")


def enum_column(enum_cls: type[StrEnum], name: str, **kwargs) -> Enum:
    """Store enums as VARCHAR with a CHECK constraint (easier to migrate than native PG enums).

    `name` should be the column name so the constraint is named ck_<table>_<column>.
    """
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
        **kwargs,
    )


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
