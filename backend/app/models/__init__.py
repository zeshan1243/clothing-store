"""Import every model so `Base.metadata` is complete (used by Alembic and tests)."""

from app.models.admin import Admin, AdminAuditLog, DocumentCounter, SiteContent
from app.models.coupons import Coupon, CouponRedemption
from app.models.delivery import DeliveryArea
from app.models.catalog import Category, Collection, Product, ProductImage, ProductVariant, SizeGuide
from app.models.invoices import Invoice
from app.models.orders import (
    Customer,
    Order,
    OrderItem,
    OrderStatusHistory,
    Payment,
    StockMovement,
)
from app.models.suppliers import Supplier, SupplierBill, SupplierBillItem, SupplierPayment

__all__ = [
    "Admin",
    "AdminAuditLog",
    "Category",
    "Collection",
    "Coupon",
    "CouponRedemption",
    "Customer",
    "DeliveryArea",
    "DocumentCounter",
    "Invoice",
    "Order",
    "OrderItem",
    "OrderStatusHistory",
    "Payment",
    "Product",
    "ProductImage",
    "ProductVariant",
    "SiteContent",
    "SizeGuide",
    "StockMovement",
    "Supplier",
    "SupplierBill",
    "SupplierBillItem",
    "SupplierPayment",
]
