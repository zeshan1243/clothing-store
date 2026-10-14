from enum import StrEnum


class AdminRole(StrEnum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"


class ProductStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class OrderStatus(StrEnum):
    PLACED = "PLACED"
    CONFIRMED = "CONFIRMED"
    PREPARING = "PREPARING"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    DELIVERY_FAILED = "DELIVERY_FAILED"
    RETURN_REQUESTED = "RETURN_REQUESTED"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"
    REFUNDED = "REFUNDED"


class PaymentMethod(StrEnum):
    COD = "COD"


class PaymentType(StrEnum):
    COD_COLLECTION = "COD_COLLECTION"
    REFUND = "REFUND"
    ADJUSTMENT = "ADJUSTMENT"


class InvoiceType(StrEnum):
    INVOICE = "INVOICE"
    CREDIT_NOTE = "CREDIT_NOTE"


class InvoiceStatus(StrEnum):
    ISSUED = "ISSUED"
    # A cancelled invoice is never edited; a credit note referencing it records the reversal.
    CREDITED = "CREDITED"


class SupplierBillStatus(StrEnum):
    UNPAID = "UNPAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"


class CouponType(StrEnum):
    PERCENT = "PERCENT"
    FIXED = "FIXED"
    FREE_DELIVERY = "FREE_DELIVERY"


class StockMovementType(StrEnum):
    RECEIVED = "RECEIVED"
    RESERVED = "RESERVED"
    RELEASED = "RELEASED"
    SOLD = "SOLD"
    ADJUSTMENT = "ADJUSTMENT"
    RETURN = "RETURN"
