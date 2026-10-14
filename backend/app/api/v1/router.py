from fastapi import APIRouter

from app.api.v1 import account, public_catalog, public_orders, public_seo
from app.api.v1.admin import auth as admin_auth
from app.api.v1.admin import categories as admin_categories
from app.api.v1.admin import collections as admin_collections
from app.api.v1.admin import coupons as admin_coupons
from app.api.v1.admin import customers as admin_customers
from app.api.v1.admin import delivery as admin_delivery
from app.api.v1.admin import inventory as admin_inventory
from app.api.v1.admin import invoices as admin_invoices
from app.api.v1.admin import orders as admin_orders
from app.api.v1.admin import products as admin_products
from app.api.v1.admin import reports as admin_reports
from app.api.v1.admin import suppliers as admin_suppliers

api_router = APIRouter()
api_router.include_router(public_catalog.router)
api_router.include_router(public_orders.router)
api_router.include_router(account.router)
api_router.include_router(public_seo.router)

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(admin_auth.router)
admin_router.include_router(admin_categories.router)
admin_router.include_router(admin_products.router)
admin_router.include_router(admin_coupons.router)
admin_router.include_router(admin_customers.router)
admin_router.include_router(admin_delivery.router)
admin_router.include_router(admin_collections.router)
admin_router.include_router(admin_inventory.router)
admin_router.include_router(admin_orders.router)
admin_router.include_router(admin_invoices.router)
admin_router.include_router(admin_reports.router)
admin_router.include_router(admin_suppliers.router)

api_router.include_router(admin_router)
