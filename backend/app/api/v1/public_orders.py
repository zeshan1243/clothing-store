import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, OptionalCustomer
from app.core.config import get_settings
from app.core.rate_limit import RateLimiter
from app.models import DeliveryArea, Order
from app.schemas.orders import (
    CartIn,
    DeliveryAreaOut,
    OrderConfirmationOut,
    OrderCreate,
    OrderItemOut,
    QuoteOut,
    TimelineStep,
    TrackOrderIn,
)
from app.services.checkout import area_out, get_order_by_token, place_order, quote

router = APIRouter(tags=["storefront-orders"])

order_rate_limiter = RateLimiter("order-create", get_settings().order_rate_limit_per_minute)


def _confirmation(order: Order) -> OrderConfirmationOut:
    return OrderConfirmationOut(
        order_number=order.order_number,
        public_token=order.public_token,
        created_at=order.created_at,
        customer_first_name=order.customer_name.split()[0],
        delivery_area=order.delivery_area,
        items=[
            OrderItemOut(
                product_name=i.product_name,
                product_name_ar=i.product_name_ar,
                sku=i.sku,
                colour=i.colour,
                size=i.size,
                image_url=i.image_url,
                unit_price=i.unit_price,
                quantity=i.quantity,
                line_total=i.line_total,
            )
            for i in order.items
        ],
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        discount_amount=order.discount_amount,
        grand_total=order.grand_total,
        currency=order.currency,
        coupon_code=order.coupon_code,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        order_status=order.order_status,
        timeline=[TimelineStep(status=h.new_status, at=h.created_at) for h in order.status_history],
    )


coupon_rate_limiter = RateLimiter("coupon-check", 30)


@router.get("/delivery-areas", response_model=list[DeliveryAreaOut])
def delivery_areas(db: DbSession) -> list[DeliveryAreaOut]:
    """Areas customers can deliver to, free zone first, each with its delivery fee."""
    areas = db.scalars(
        select(DeliveryArea)
        .where(DeliveryArea.is_active.is_(True))
        .order_by(DeliveryArea.is_free.desc(), DeliveryArea.distance_km, DeliveryArea.name)
    )
    return [area_out(a) for a in areas]


@router.post("/cart/quote", response_model=QuoteOut)
def cart_quote(body: CartIn, db: DbSession, request: Request) -> QuoteOut:
    """Server-side prices, stock and totals for a cart, shown before the customer submits."""
    if body.coupon_code:
        coupon_rate_limiter(request)  # slows down coupon-code guessing
    return quote(db, body)


@router.post(
    "/orders",
    response_model=OrderConfirmationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(order_rate_limiter)],
)
def create_order(body: OrderCreate, db: DbSession, response: Response, account: OptionalCustomer) -> OrderConfirmationOut:
    order, created = place_order(db, body, account)
    if not created:
        response.status_code = status.HTTP_200_OK
    return _confirmation(order)


# Order numbers are sequential, so tracking also requires the phone number used at checkout.
track_rate_limiter = RateLimiter("order-track", 10)
TRACK_NOT_FOUND = "We couldn't find an order with that number and phone. Check both and try again."


@router.post("/orders/track", response_model=OrderConfirmationOut, dependencies=[Depends(track_rate_limiter)])
def track_order(body: TrackOrderIn, db: DbSession) -> OrderConfirmationOut:
    """Look up an order by its number plus the customer's phone. Same error for either mismatch."""
    order = db.scalar(select(Order).where(Order.order_number == body.order_number))
    if order is None or not hmac.compare_digest(order.customer_phone, body.phone):
        raise HTTPException(status.HTTP_404_NOT_FOUND, TRACK_NOT_FOUND)
    return _confirmation(order)


@router.get("/orders/{public_token}", response_model=OrderConfirmationOut)
def get_order(
    public_token: Annotated[str, Path(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")],
    db: DbSession,
) -> OrderConfirmationOut:
    order = get_order_by_token(db, public_token)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return _confirmation(order)
