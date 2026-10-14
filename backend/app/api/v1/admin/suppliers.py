from collections import defaultdict
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentAdmin, DbSession
from app.models import Admin, ProductVariant, Supplier, SupplierBill, SupplierBillItem
from app.models.enums import SupplierBillStatus
from app.models.mixins import ZERO
from app.schemas.suppliers import (
    BillItemOut,
    CurrencyBalance,
    ReceiveIn,
    SupplierBillDetail,
    SupplierBillIn,
    SupplierBillListItem,
    SupplierBillUpdate,
    SupplierIn,
    SupplierOut,
    SupplierPaymentIn,
    SupplierPaymentOut,
)
from app.services.audit import record_audit
from app.services.suppliers import (
    is_overdue,
    receive_items,
    record_supplier_payment,
    validate_items,
)

router = APIRouter(tags=["admin-suppliers"])


def _balances(bills: list[SupplierBill]) -> list[CurrencyBalance]:
    sums: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for b in bills:
        s = sums[b.currency]
        s["billed"] += b.total_amount
        s["paid"] += b.paid_amount
        if is_overdue(b):
            s["overdue"] += b.total_amount - b.paid_amount
    return [
        CurrencyBalance(
            currency=c, billed=s["billed"], paid=s["paid"], outstanding=s["billed"] - s["paid"], overdue=s["overdue"]
        )
        for c, s in sorted(sums.items())
    ]


def _supplier_out(supplier: Supplier) -> SupplierOut:
    out = SupplierOut.model_validate(supplier)
    out.balances = _balances(supplier.bills)
    out.open_bills = sum(1 for b in supplier.bills if b.status != SupplierBillStatus.PAID)
    return out


def _list_item(bill: SupplierBill) -> SupplierBillListItem:
    return SupplierBillListItem(
        id=bill.id,
        supplier_id=bill.supplier_id,
        supplier_name=bill.supplier.name,
        supplier_reference=bill.supplier_reference,
        bill_date=bill.bill_date,
        due_date=bill.due_date,
        currency=bill.currency,
        total_amount=bill.total_amount,
        paid_amount=bill.paid_amount,
        outstanding_amount=bill.outstanding_amount,
        status=bill.status,
        is_overdue=is_overdue(bill),
        items_pending=sum(i.quantity - i.quantity_received for i in bill.items if i.product_variant_id),
    )


def _load_bill(db: Session, bill_id: int, lock: bool = False) -> SupplierBill:
    query = (
        select(SupplierBill)
        .where(SupplierBill.id == bill_id)
        .options(selectinload(SupplierBill.items), selectinload(SupplierBill.payments), selectinload(SupplierBill.supplier))
        .execution_options(populate_existing=True)
    )
    if lock:
        query = query.with_for_update(of=SupplierBill)
    bill = db.scalar(query)
    if bill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier bill not found")
    return bill


def _detail(db: Session, bill_id: int) -> SupplierBillDetail:
    bill = _load_bill(db, bill_id)
    names = dict(db.execute(select(Admin.id, Admin.name)).all())
    skus = dict(
        db.execute(
            select(ProductVariant.id, ProductVariant.sku).where(
                ProductVariant.id.in_([i.product_variant_id for i in bill.items if i.product_variant_id])
            )
        ).all()
    )
    items = []
    for i in bill.items:
        out = BillItemOut.model_validate(i)
        out.sku = skus.get(i.product_variant_id)
        items.append(out)
    payments = []
    for p in bill.payments:
        out = SupplierPaymentOut.model_validate(p)
        out.recorded_by = names.get(p.recorded_by_admin_id)
        payments.append(out)
    return SupplierBillDetail(
        **_list_item(bill).model_dump(),
        description=bill.description,
        notes=bill.notes,
        items=items,
        payments=payments,
        created_by=names.get(bill.created_by_admin_id),
        created_at=bill.created_at,
    )


# ---------- Suppliers ----------


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: DbSession, _: CurrentAdmin, include_inactive: bool = False) -> list[SupplierOut]:
    query = select(Supplier).options(selectinload(Supplier.bills)).order_by(Supplier.name)
    if not include_inactive:
        query = query.where(Supplier.is_active.is_(True))
    return [_supplier_out(s) for s in db.scalars(query)]


@router.post("/suppliers", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(body: SupplierIn, db: DbSession, admin: CurrentAdmin) -> SupplierOut:
    supplier = Supplier(**body.model_dump())
    db.add(supplier)
    db.flush()
    record_audit(db, admin, "supplier.create", "supplier", supplier.id, {"name": supplier.name})
    db.commit()
    db.refresh(supplier, ["bills"])
    return _supplier_out(supplier)


@router.get("/suppliers/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: DbSession, _: CurrentAdmin) -> SupplierOut:
    supplier = db.scalar(select(Supplier).where(Supplier.id == supplier_id).options(selectinload(Supplier.bills)))
    if supplier is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    return _supplier_out(supplier)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, body: SupplierIn, db: DbSession, admin: CurrentAdmin) -> SupplierOut:
    supplier = db.scalar(select(Supplier).where(Supplier.id == supplier_id).options(selectinload(Supplier.bills)))
    if supplier is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(supplier, key, value)
    record_audit(db, admin, "supplier.update", "supplier", supplier.id, {k: str(v) for k, v in changes.items()})
    db.commit()
    return _supplier_out(supplier)


# ---------- Bills ----------


@router.get("/supplier-bills", response_model=list[SupplierBillListItem])
def list_bills(
    db: DbSession,
    _: CurrentAdmin,
    supplier_id: int | None = None,
    status_filter: Annotated[SupplierBillStatus | None, Query(alias="status")] = None,
    outstanding_only: bool = False,
) -> list[SupplierBillListItem]:
    query = (
        select(SupplierBill)
        .options(selectinload(SupplierBill.supplier), selectinload(SupplierBill.items))
        .order_by(SupplierBill.bill_date.desc(), SupplierBill.id.desc())
    )
    if supplier_id:
        query = query.where(SupplierBill.supplier_id == supplier_id)
    if status_filter:
        query = query.where(SupplierBill.status == status_filter)
    if outstanding_only:
        query = query.where(SupplierBill.status != SupplierBillStatus.PAID)
    return [_list_item(b) for b in db.scalars(query)]


@router.post("/supplier-bills", response_model=SupplierBillDetail, status_code=status.HTTP_201_CREATED)
def create_bill(body: SupplierBillIn, db: DbSession, admin: CurrentAdmin) -> SupplierBillDetail:
    supplier = db.get(Supplier, body.supplier_id)
    if supplier is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Supplier not found")
    validate_items(db, body.items)

    bill = SupplierBill(
        **body.model_dump(exclude={"items", "receive_now"}),
        paid_amount=ZERO,
        status=SupplierBillStatus.UNPAID,
        created_by_admin_id=admin.id,
    )
    bill.items = [SupplierBillItem(**i.model_dump()) for i in body.items]
    db.add(bill)
    db.flush()
    record_audit(
        db, admin, "supplier_bill.create", "supplier_bill", bill.id,
        {"supplier": supplier.name, "total": f"{bill.total_amount:.2f}", "currency": bill.currency},
    )
    if body.receive_now:
        receivable = [(i, i.quantity) for i in bill.items if i.product_variant_id]
        if receivable:
            receive_items(db, bill, receivable, admin)
    db.commit()
    return _detail(db, bill.id)


@router.get("/supplier-bills/{bill_id}", response_model=SupplierBillDetail)
def get_bill(bill_id: int, db: DbSession, _: CurrentAdmin) -> SupplierBillDetail:
    return _detail(db, bill_id)


@router.patch("/supplier-bills/{bill_id}", response_model=SupplierBillDetail)
def update_bill(bill_id: int, body: SupplierBillUpdate, db: DbSession, admin: CurrentAdmin) -> SupplierBillDetail:
    """Only reference, due date and notes are editable; amounts are fixed once recorded."""
    bill = _load_bill(db, bill_id, lock=True)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("due_date") and changes["due_date"] < bill.bill_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Due date can't be before the bill date")
    for key, value in changes.items():
        setattr(bill, key, value)
    record_audit(db, admin, "supplier_bill.update", "supplier_bill", bill.id, {k: str(v) for k, v in changes.items()})
    db.commit()
    return _detail(db, bill_id)


@router.post("/supplier-bills/{bill_id}/payments", response_model=SupplierBillDetail, status_code=status.HTTP_201_CREATED)
def add_payment(bill_id: int, body: SupplierPaymentIn, db: DbSession, admin: CurrentAdmin) -> SupplierBillDetail:
    bill = _load_bill(db, bill_id, lock=True)
    record_supplier_payment(db, bill, admin, body)
    db.commit()
    return _detail(db, bill_id)


@router.post("/supplier-bills/{bill_id}/receive", response_model=SupplierBillDetail)
def receive(bill_id: int, body: ReceiveIn, db: DbSession, admin: CurrentAdmin) -> SupplierBillDetail:
    bill = _load_bill(db, bill_id, lock=True)
    items = {i.id: i for i in bill.items}
    lines = []
    for line in body.lines:
        item = items.get(line.item_id)
        if item is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Item {line.item_id} is not on this bill")
        lines.append((item, line.quantity))
    receive_items(db, bill, lines, admin)
    db.commit()
    return _detail(db, bill_id)

