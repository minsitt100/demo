"""Generate a sample invoice PDF for INV-2041 with known coordinates for
auto-population highlights. Coordinates (in CSS pixels at 1.5x PDF.js scale)
are emitted alongside so the front-end can position hover regions exactly."""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

OUT = "invoice-2041.pdf"
W, H = LETTER  # 612 x 792 pts


def draw():
    c = canvas.Canvas(OUT, pagesize=LETTER)

    # ---- Header
    c.setFont("Helvetica-Bold", 22)
    c.drawString(50, H - 60, "INVOICE")

    c.setFont("Helvetica", 10)
    c.setFillGray(0.35)
    c.drawRightString(W - 50, H - 55, "Acme Supplies Co.")
    c.drawRightString(W - 50, H - 70, "123 Industrial Way")
    c.drawRightString(W - 50, H - 85, "Springfield, IL 62704")
    c.drawRightString(W - 50, H - 100, "billing@acmesupplies.example")
    c.setFillGray(0)

    # ---- Bill to
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, H - 130, "BILL TO")
    c.setFont("Helvetica", 10)
    c.drawString(50, H - 146, "ACME Corp")
    c.drawString(50, H - 160, "Accounts Payable")
    c.drawString(50, H - 174, "ap@acmecorp.example")

    # ---- Meta block (right side) — these positions matter for highlighting
    label_x = 360
    value_x = 460
    top = H - 130
    line = 16

    c.setFont("Helvetica-Bold", 10)
    c.drawString(label_x, top, "Invoice #")
    c.drawString(label_x, top - line, "Invoice Date")
    c.drawString(label_x, top - 2 * line, "Due Date")
    c.drawString(label_x, top - 3 * line, "PO Number")
    c.drawString(label_x, top - 4 * line, "Payment Term")

    c.setFont("Helvetica", 10)
    c.drawString(value_x, top, "INV-2041")
    c.drawString(value_x, top - line, "May 8, 2026")
    c.drawString(value_x, top - 2 * line, "Jun 7, 2026")
    c.drawString(value_x, top - 3 * line, "PO-4471")
    c.drawString(value_x, top - 4 * line, "Net 30")

    # ---- Line items table
    table_top = H - 240
    c.setStrokeGray(0.85)
    c.line(50, table_top, W - 50, table_top)
    c.line(50, table_top - 24, W - 50, table_top - 24)

    c.setFont("Helvetica-Bold", 9)
    c.setFillGray(0.4)
    c.drawString(60, table_top - 16, "DESCRIPTION")
    c.drawRightString(380, table_top - 16, "QTY")
    c.drawRightString(460, table_top - 16, "UNIT PRICE")
    c.drawRightString(W - 60, table_top - 16, "AMOUNT")
    c.setFillGray(0)

    rows = [
        ("Heavy-duty packing tape (24-pack)", "10", "$28.50", "$285.00"),
        ("Industrial shrink wrap, 500ft roll", "6", "$42.25", "$253.50"),
        ("Corrugated boxes 18x18x16 (bundle)", "20", "$18.00", "$360.00"),
        ("Pallet jack maintenance service", "1", "$350.00", "$350.00"),
    ]
    c.setFont("Helvetica", 10)
    y = table_top - 44
    for desc, qty, unit, amt in rows:
        c.drawString(60, y, desc)
        c.drawRightString(380, y, qty)
        c.drawRightString(460, y, unit)
        c.drawRightString(W - 60, y, amt)
        y -= 20

    # ---- Totals
    totals_top = y - 20
    c.line(360, totals_top + 14, W - 50, totals_top + 14)
    c.setFont("Helvetica", 10)
    c.drawString(380, totals_top, "Subtotal")
    c.drawRightString(W - 60, totals_top, "$1,248.50")
    c.drawString(380, totals_top - 16, "Tax")
    c.drawRightString(W - 60, totals_top - 16, "$0.00")

    c.setFont("Helvetica-Bold", 11)
    c.drawString(380, totals_top - 38, "Total Due")
    c.drawRightString(W - 60, totals_top - 38, "$1,248.50")

    # ---- Footer note
    c.setFont("Helvetica-Oblique", 9)
    c.setFillGray(0.5)
    c.drawString(50, 60, "Thank you for your business. Please remit payment by the due date above.")

    c.showPage()
    c.save()


if __name__ == "__main__":
    draw()
    print(f"Wrote {OUT}")
