"""PDF rendering for invoices, credit notes and the outside-parcel shipping label.

PDFs are rendered on demand from the stored invoice snapshot (`invariant=1` makes the bytes
reproducible). The only live data added is the payment receipt block on invoices, which comes from
the append-only `payments` table.

Note: the built-in Helvetica font covers Latin text only. If customer names in Arabic script need to
print, register a Unicode TTF font (e.g. Noto Sans Arabic) here.
"""

from datetime import date
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, A6
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import Invoice, Order
from app.models.enums import InvoiceType, PaymentType
from app.services.numbering import QATAR_TZ
from app.services.order_operations import derive_payment_status, payment_totals

_styles = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=_styles["Normal"], fontName="Helvetica", fontSize=9, leading=12)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, leading=10, textColor=colors.HexColor("#555555"))
H1 = ParagraphStyle("h1", parent=BODY, fontName="Helvetica-Bold", fontSize=18, leading=22)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Helvetica-Bold", fontSize=10, leading=13)
RIGHT = ParagraphStyle("right", parent=BODY, alignment=TA_RIGHT)
GRID = colors.HexColor("#d6d3d1")


def _p(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(escape(text or "").replace("\n", "<br/>"), style)


def _date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d %b %Y")


def _qar(amount: str | Decimal, currency: str = "QAR") -> str:
    return f"{currency} {Decimal(amount):,.2f}"


def _payment_block(order: Order) -> list:
    status = derive_payment_status(order)
    collected, refunded = payment_totals(order)
    if status.value == "PENDING" and collected == 0:
        return [_p("Payment status: Unpaid — cash due on delivery.", H2)]
    rows = [[_p("Date", H2), _p("Receipt", H2), _p("Amount", ParagraphStyle("h2r", parent=H2, alignment=TA_RIGHT))]]
    for p in order.payments:
        kind = "Cash received" if p.type == PaymentType.COD_COLLECTION else "Refund paid"
        sign = "" if p.type == PaymentType.COD_COLLECTION else "-"
        rows.append([
            _p(p.collected_at.astimezone(QATAR_TZ).strftime("%d %b %Y %H:%M")),
            _p(f"{kind}{f' (ref {p.reference})' if p.reference else ''}"),
            _p(f"{sign}{_qar(p.amount, p.currency)}", RIGHT),
        ])
    label = {"PAID": "Paid", "PENDING": "Part paid", "PARTIALLY_REFUNDED": "Partly refunded", "REFUNDED": "Refunded"}
    table = Table(rows, colWidths=[40 * mm, 90 * mm, 40 * mm])
    table.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [_p(f"Payment status: {label[status.value]}", H2), Spacer(1, 2 * mm), table]


def render_invoice_pdf(invoice: Invoice, order: Order) -> bytes:
    s = invoice.snapshot
    is_credit = invoice.invoice_type == InvoiceType.CREDIT_NOTE
    currency = s["currency"]
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"{'Credit note' if is_credit else 'Invoice'} {s['number']}", author=s["seller"]["name"],
        invariant=1,
    )
    seller = s["seller"]
    seller_lines = [seller["address"], seller["phone"], seller["email"],
                    f"Reg. {seller['registration']}" if seller["registration"] else ""]
    meta_rows = [
        ["Credit note no." if is_credit else "Invoice no.", s["number"]],
        ["Date", _date(s["date"])],
        ["Order no.", s["order_number"]],
        ["Order date", _date(s["order_date"])],
    ]
    if is_credit:
        meta_rows.append(["Credits invoice", f"{s['credited_invoice_number']} ({_date(s['credited_invoice_date'])})"])

    header = Table(
        [[
            [_p(seller["name"], H1), _p("\n".join(line for line in seller_lines if line), SMALL)],
            [_p("CREDIT NOTE" if is_credit else "INVOICE", ParagraphStyle("t", parent=H1, alignment=TA_RIGHT)),
             Table([[_p(k, SMALL), _p(v, RIGHT)] for k, v in meta_rows], colWidths=[30 * mm, 50 * mm])],
        ]],
        colWidths=[94 * mm, 80 * mm],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    customer = s["customer"]
    bill_to = [
        _p("Bill to", H2),
        _p("\n".join([customer["name"], *customer["address"], customer["phone"], customer.get("email") or ""]).strip()),
    ]

    h2_right = ParagraphStyle("h2_right", parent=H2, alignment=TA_RIGHT)
    lines = [[_p("Item", H2), _p("SKU", H2), _p("Qty", h2_right), _p("Unit price", h2_right), _p("Total", h2_right)]]
    for line in s["lines"]:
        variant = " / ".join(v for v in (line["colour"], line["size"]) if v)
        lines.append([
            _p(line["description"] + (f"\n{variant}" if variant else "")),
            _p(line["sku"], SMALL),
            _p(str(line["quantity"]), RIGHT),
            _p(_qar(line["unit_price"], currency), RIGHT),
            _p(_qar(line["line_total"], currency), RIGHT),
        ])
    items = Table(lines, colWidths=[72 * mm, 30 * mm, 14 * mm, 29 * mm, 29 * mm], repeatRows=1)
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    total_rows = [["Subtotal", _qar(s["subtotal"], currency)], ["Delivery", _qar(s["delivery_fee"], currency)]]
    if Decimal(s["discount"]) > 0:
        label = f"Discount ({s['coupon_code']})" if s.get("coupon_code") else "Discount"
        total_rows.append([label, f"-{_qar(s['discount'], currency)}"])
    if Decimal(s["tax"]) > 0:
        total_rows.append(["Tax", _qar(s["tax"], currency)])
    total_rows.append(["Total credited" if is_credit else "Total", _qar(s["total"], currency)])
    bold_right = ParagraphStyle("bold_right", parent=H2, alignment=TA_RIGHT)
    total_cells = [[_p(k), _p(v, RIGHT)] for k, v in total_rows[:-1]]
    total_cells.append([_p(total_rows[-1][0], H2), _p(total_rows[-1][1], bold_right)])
    totals = Table(total_cells, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 1, colors.black)]))

    story = [header, Spacer(1, 8 * mm), *bill_to, Spacer(1, 6 * mm), items, Spacer(1, 3 * mm), totals,
             Spacer(1, 6 * mm), _p(f"Payment method: {s['payment_method']}. All amounts in {currency}.")]
    if is_credit:
        story += [Spacer(1, 3 * mm), _p(f"Reason: {s['reason']}")]
    else:
        story += [Spacer(1, 4 * mm), *_payment_block(order)]
    story += [Spacer(1, 10 * mm), _p("Thank you for shopping with us.", SMALL)]
    doc.build(story)
    return buffer.getvalue()


def render_shipping_label(order: Order, business_name: str, business_phone: str) -> bytes:
    """A6 label for the outside of the parcel: delivery details only, no prices or item list."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A6, leftMargin=8 * mm, rightMargin=8 * mm, topMargin=8 * mm, bottomMargin=8 * mm,
        title=f"Label {order.order_number}", invariant=1,
    )
    big = ParagraphStyle("big", parent=BODY, fontName="Helvetica-Bold", fontSize=14, leading=18)
    address = [
        f"Zone {order.delivery_zone}" if order.delivery_zone else "",
        f"Street {order.delivery_street}" if order.delivery_street else "",
        f"Building {order.delivery_building}" if order.delivery_building else "",
        f"Flat/villa {order.delivery_unit}" if order.delivery_unit else "",
    ]
    story = [
        _p(f"FROM: {business_name}" + (f"  ·  {business_phone}" if business_phone else ""), SMALL),
        Spacer(1, 4 * mm),
        _p("DELIVER TO", H2),
        _p(order.customer_name, big),
        _p(order.customer_phone, big),
        Spacer(1, 2 * mm),
        _p(order.delivery_area, H2),
        _p(", ".join(a for a in address if a)),
    ]
    if order.delivery_landmark:
        story.append(_p(f"Landmark: {order.delivery_landmark}"))
    if order.delivery_instructions:
        story += [Spacer(1, 2 * mm), _p(f"Notes: {order.delivery_instructions}", SMALL)]
    story += [Spacer(1, 5 * mm), _p(f"Order {order.order_number}", big), _p("CASH ON DELIVERY", H2)]
    doc.build(story)
    return buffer.getvalue()
