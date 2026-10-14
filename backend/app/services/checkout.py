"""Cart pricing and COD order placement.

All prices, totals and stock are computed here from the database; nothing the browser sends except
variant IDs and quantities is trusted.
"""

import secrets
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.core.config import get_settings
from app.models import (
    Category,
    Customer,
    Order,
    OrderItem,
    OrderStatusHistory,
    Product,
    ProductVariant,
    StockMovement,
)
from app.models.enums import OrderStatus, PaymentStatus, ProductStatus, StockMovementType
from app.models.mixins import ZERO
from app.models.delivery import DeliveryArea
from app.schemas.orders import (
    AppliedCouponOut,
    CartIn,
    CartLineIn,
    CouponErrorOut,
    DeliveryAreaOut,
    OrderCreate,
    QuoteLine,
    QuoteOut,
)
from app.services.coupons import CouponError, CouponResult, customer_uses, evaluate, find_coupon, redeem
from app.services.delivery import fee_for, find_area
from app.services.numbering import next_document_number

CENT = Decimal("0.01")


@dataclass
class _PricedCart:
    lines: list[QuoteLine]
    subtotal: Decimal
    delivery_fee: Decimal
    discount_amount: Decimal
    grand_total: Decimal

    @property
    def ok(self) -> bool:
        return all(line.problem is None for line in self.lines)


def _sellable(variant: ProductVariant) -> bool:
    product = variant.product
    category_ok = product.category is None or product.category.is_active
    return variant.is_active and product.status == ProductStatus.ACTIVE and category_ok


def _price(variants: dict[int, ProductVariant], items: list[CartLineIn], area: DeliveryArea | None) -> _PricedCart:
    settings = get_settings()
    lines: list[QuoteLine] = []
    subtotal = ZERO

    for item in items:
        variant = variants.get(item.variant_id)
        if variant is None or not _sellable(variant):
            lines.append(
                QuoteLine(
                    variant_id=item.variant_id,
                    product_name=variant.product.name if variant else "Unavailable item",
                    product_slug=variant.product.slug if variant else "",
                    sku=variant.sku if variant else "",
                    colour=variant.colour if variant else "",
                    size=variant.size if variant else "",
                    image_url=None,
                    unit_price=ZERO,
                    requested_quantity=item.quantity,
                    available_quantity=0,
                    quantity=0,
                    line_total=ZERO,
                    problem="This item is no longer available.",
                    problem_code="unavailable",
                )
            )
            continue

        product = variant.product
        available = variant.available_quantity
        limit = min(available, settings.max_quantity_per_line)
        problem = problem_code = None
        if available == 0:
            problem, problem_code = "Sold out.", "sold_out"
        elif item.quantity > limit:
            if available < settings.max_quantity_per_line:
                problem, problem_code = f"Only {available} left.", "limited"
            else:
                problem = f"Maximum {settings.max_quantity_per_line} per item."
                problem_code = "max_per_item"
        quantity = min(item.quantity, limit)
        unit_price = product.effective_price.quantize(CENT)
        line_total = (unit_price * quantity).quantize(CENT)
        subtotal += line_total
        image = next((i for i in product.images if i.colour == variant.colour), None) or (
            product.images[0] if product.images else None
        )
        lines.append(
            QuoteLine(
                variant_id=variant.id,
                product_name=product.name,
                product_name_ar=product.name_ar,
                product_slug=product.slug,
                sku=variant.sku,
                colour=variant.colour,
                size=variant.size,
                image_url=image.image_url if image else None,
                unit_price=unit_price,
                requested_quantity=item.quantity,
                available_quantity=available,
                quantity=quantity,
                line_total=line_total,
                problem=problem,
                problem_code=problem_code,
            )
        )

    # No area yet (cart page): the fee is added once the customer picks where to deliver.
    delivery_fee = fee_for(area) if area is not None and subtotal > 0 else ZERO
    if settings.free_delivery_threshold is not None and subtotal >= settings.free_delivery_threshold:
        delivery_fee = ZERO
    discount = ZERO
    grand_total = (subtotal + delivery_fee - discount).quantize(CENT)
    return _PricedCart(lines, subtotal.quantize(CENT), delivery_fee.quantize(CENT), discount, grand_total)


def _with_coupon(priced: _PricedCart, result: CouponResult) -> _PricedCart:
    grand_total = (priced.subtotal + result.delivery_fee - result.discount).quantize(CENT)
    return _PricedCart(priced.lines, priced.subtotal, result.delivery_fee, result.discount, grand_total)


def _coupon_out(result: CouponResult) -> AppliedCouponOut:
    c = result.coupon
    return AppliedCouponOut(code=c.code, discount_type=c.discount_type.value, value=c.value, savings=result.value_given)


def _coupon_error_out(err: CouponError) -> CouponErrorOut:
    return CouponErrorOut(code=err.code, min_subtotal=err.min_subtotal)


def _variant_query(variant_ids: list[int]):
    return (
        select(ProductVariant)
        .join(ProductVariant.product)
        .outerjoin(Product.category)
        .options(
            contains_eager(ProductVariant.product).contains_eager(Product.category),
            contains_eager(ProductVariant.product).selectinload(Product.images),
        )
        .where(ProductVariant.id.in_(variant_ids))
        .order_by(ProductVariant.id)
    )


def quote(db: Session, cart: CartIn) -> QuoteOut:
    ids = [i.variant_id for i in cart.items]
    variants = {v.id: v for v in db.scalars(_variant_query(ids)).unique()}
    area = find_area(db, cart.delivery_area)
    priced = _price(variants, cart.items, area)
    coupon_out = coupon_error = None
    if cart.coupon_code:
        try:
            result = evaluate(find_coupon(db, cart.coupon_code), priced.subtotal, priced.delivery_fee)
            priced = _with_coupon(priced, result)
            coupon_out = _coupon_out(result)
        except CouponError as err:
            coupon_error = _coupon_error_out(err)
    return QuoteOut(
        lines=priced.lines,
        subtotal=priced.subtotal,
        delivery_fee=priced.delivery_fee,
        discount_amount=priced.discount_amount,
        grand_total=priced.grand_total,
        currency=get_settings().currency,
        ok=priced.ok,
        coupon=coupon_out,
        coupon_error=coupon_error,
        delivery_area=area_out(area) if area else None,
    )


def _existing_order(db: Session, idempotency_key: str) -> Order | None:
    return db.scalar(
        select(Order).where(Order.idempotency_key == idempotency_key).options(selectinload(Order.items))
    )


def place_order(db: Session, data: OrderCreate, account: Customer | None = None) -> tuple[Order, bool]:
    """Create a COD order and reserve its stock atomically. Returns (order, created)."""
    if account is not None:
        # Signed-in orders always belong to the account's own number.
        data.customer.phone = account.phone
    existing = _existing_order(db, data.idempotency_key)
    if existing is not None:
        return existing, False

    area = find_area(db, data.delivery.area)
    if area is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"message": "Choose your delivery area from the list.", "field": "delivery.area"},
        )

    ids = sorted(i.variant_id for i in data.items)
    # Lock variant rows in id order (consistent order avoids deadlocks between concurrent checkouts).
    variants = {
        v.id: v
        for v in db.scalars(_variant_query(ids).with_for_update(of=ProductVariant)).unique()
    }
    priced = _price(variants, data.items, area)
    if not priced.ok:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": "Some items in your cart have changed. Please review your cart.",
                "problems": [
                    {
                        "variant_id": l.variant_id,
                        "problem": l.problem,
                        "problem_code": l.problem_code,
                        "available_quantity": l.available_quantity,
                    }
                    for l in priced.lines
                    if l.problem
                ],
            },
        )

    customer_id = db.scalar(
        insert(Customer)
        .values(full_name=data.customer.full_name, phone=data.customer.phone, email=data.customer.email)
        .on_conflict_do_update(
            index_elements=[Customer.phone],
            # Guest records follow the latest checkout details; a registered profile is only
            # changed by its owner (orders keep their own name/contact snapshot either way).
            set_={
                "full_name": case((Customer.registered_at.is_(None), data.customer.full_name), else_=Customer.full_name),
                "email": case(
                    (Customer.registered_at.is_(None), func.coalesce(data.customer.email, Customer.email)),
                    else_=Customer.email,
                ),
            },
        )
        .returning(Customer.id)
    )

    # Coupon: lock its row (after the variant locks, always in that order) so concurrent orders
    # can't exceed usage_limit, then re-check every rule including the per-customer limit.
    coupon_result: CouponResult | None = None
    if data.coupon_code:
        try:
            coupon = find_coupon(db, data.coupon_code, lock=True)
            coupon_result = evaluate(coupon, priced.subtotal, priced.delivery_fee)
            if coupon.per_customer_limit is not None and customer_uses(db, coupon, customer_id) >= coupon.per_customer_limit:
                raise CouponError("customer_limit")
        except CouponError as err:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail={
                    "message": "This coupon can't be used for this order.",
                    "coupon_error": _coupon_error_out(err).model_dump(mode="json"),
                },
            ) from None
        priced = _with_coupon(priced, coupon_result)

    settings = get_settings()
    order = Order(
        order_number=next_document_number(db, "order", "ORD"),
        public_token=secrets.token_urlsafe(24),
        idempotency_key=data.idempotency_key,
        placed_signed_in=account is not None,
        customer_id=customer_id,
        customer_name=data.customer.full_name,
        customer_phone=data.customer.phone,
        customer_email=data.customer.email,
        delivery_area=area.name,
        delivery_distance_km=area.distance_km,
        delivery_zone=data.delivery.zone,
        delivery_street=data.delivery.street,
        delivery_building=data.delivery.building,
        delivery_unit=data.delivery.unit,
        delivery_landmark=data.delivery.landmark,
        delivery_instructions=data.delivery.instructions,
        subtotal=priced.subtotal,
        delivery_fee=priced.delivery_fee,
        discount_amount=priced.discount_amount,
        tax_amount=ZERO,
        grand_total=priced.grand_total,
        currency=settings.currency,
        coupon_id=coupon_result.coupon.id if coupon_result else None,
        coupon_code=coupon_result.coupon.code if coupon_result else None,
        payment_method=data.payment_method,
        payment_status=PaymentStatus.PENDING,
        order_status=OrderStatus.PLACED,
        customer_notes=data.notes,
    )
    db.add(order)

    for line in priced.lines:
        variant = variants[line.variant_id]
        order.items.append(
            OrderItem(
                product_variant_id=variant.id,
                product_id=variant.product_id,
                product_name=line.product_name,
                product_name_ar=line.product_name_ar,
                sku=line.sku,
                colour=line.colour,
                size=line.size,
                image_url=line.image_url,
                unit_price=line.unit_price,
                quantity=line.quantity,
                line_total=line.line_total,
            )
        )
        variant.reserved_quantity += line.quantity

    db.flush()
    for line in priced.lines:
        db.add(
            StockMovement(
                product_variant_id=line.variant_id,
                movement_type=StockMovementType.RESERVED,
                quantity_change=line.quantity,
                related_order_id=order.id,
                reason=f"Reserved for order {order.order_number}",
            )
        )
    db.add(
        OrderStatusHistory(
            order_id=order.id, old_status=None, new_status=OrderStatus.PLACED, note="Order placed by customer"
        )
    )
    if coupon_result is not None:
        redeem(db, coupon_result, order)

    if account is not None and data.save_address:
        d = data.delivery
        address = {"area": area.name, "zone": d.zone, "street": d.street, "building": d.building,
                   "unit": d.unit, "landmark": d.landmark, "instructions": d.instructions}
        account.default_address = {k: v for k, v in address.items() if v}

    try:
        db.commit()
    except IntegrityError:
        # Another request with the same idempotency key won the race: return its order.
        db.rollback()
        existing = _existing_order(db, data.idempotency_key)
        if existing is None:
            raise
        return existing, False
    return order, True


def get_order_by_token(db: Session, token: str) -> Order | None:
    return db.scalar(select(Order).where(Order.public_token == token).options(selectinload(Order.items)))


def area_out(area: DeliveryArea) -> DeliveryAreaOut:
    out = DeliveryAreaOut.model_validate(area)
    out.fee = fee_for(area)
    return out
