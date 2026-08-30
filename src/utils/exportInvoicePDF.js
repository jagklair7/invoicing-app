// src/utils/exportInvoicePDF.js
// Generates a clean, vector PDF invoice with logo using jsPDF.
// No html2canvas — draws everything as real PDF text/shapes so it's sharp at any zoom.
//
// Install:  npm install jspdf
// Usage:    import { exportInvoicePDF } from '../utils/exportInvoicePDF'
//           await exportInvoicePDF(invoice, customer, items, orgId)
import { calcLineTotal, calcLineDiscount } from './discount'
import { jsPDF } from 'jspdf'
import { supabase } from '../app/supabaseClient' // Make sure this path is correct

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  slate:     [146, 201, 192],  // #92c9c0d8 — header bg
  teal:      [13,  115, 119],  // #0d7477e8 — accent
  tealLight: [232, 245, 245],  // #e8f5f5
  text:      [30,  41,  59],   // body text
  muted:     [100, 116, 139],  // slate-500
  light:     [148, 163, 184],  // slate-400
  border:    [226, 232, 240],  // slate-200
  white:     [255, 255, 255],
  green:     [5, 150, 105],    // paid / discount green
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) : '—'

function setColor(doc, rgb, type = 'text') {
  const safe = Array.isArray(rgb) ? rgb : [0, 0, 0]
  if (type === 'fill') doc.setFillColor(...safe)
  else doc.setTextColor(...safe)
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => resolve(null)  // logo missing → skip gracefully
    img.src = src
  })
}

// ── Main export function ──────────────────────────────────────────────────────
export async function exportInvoicePDF(invoice, customer, items = [], orgId) {
  if ((!items || items.length === 0) && invoice?.id) {
    const { data: fetchedItems, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .eq('org_id', orgId)

    if (!itemsErr && Array.isArray(fetchedItems)) {
      items = fetchedItems
    }
  }

  // ── Fetch recorded payments (mirrors PaymentsSection.jsx query) ────────────
  let payments = []
  if (invoice?.id) {
    const { data: paymentRows, error: paymentsErr } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoice.id)
      .eq('org_id', orgId)
      .order('payment_date', { ascending: true })

    if (!paymentsErr && Array.isArray(paymentRows)) {
      payments = paymentRows
    }
  }

  const { data: orgRow } = await supabase
    .from('organization_settings')
    .select('company_name, company_address, company_city, company_phone, gst_number, company_logo_url')
    .eq('org_id', orgId)
    .single()

 /* const COMPANY = {
    name:    orgRow?.company_name    || 'Klair Computer Inc.',
    address: orgRow?.company_address || '1319 Malone Place NW',
    city:    orgRow?.company_city    || 'Edmonton, AB T6R 0G6',
    phone:   orgRow?.company_phone   || '780-265-0042',
    gst:     orgRow?.gst_number      || '831146329',
    logo:    orgRow?.company_logo_url || '/icon.png',
  } */

  const COMPANY = {
  name:    orgRow?.company_name    || '',
  address: orgRow?.company_address || '',
  city:    orgRow?.company_city    || '',
  phone:   orgRow?.company_phone   || '',
  gst:     orgRow?.gst_number      || '',
  logo:    orgRow?.company_logo_url || '/icon.png',
}

  const { data: productList } = await supabase
    .from('products')
    .select('id, name')
    .eq('org_id', orgId)

  const productMap = new Map((productList || []).map(p => [p.id, p.name]))

  // 2. INITIALIZE DOC FIRST TO AVOID CORS ISSUES WITH LOGO LOADING
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // 3. NOW you can access doc.internal dimensions
  const pw   = doc.internal.pageSize.getWidth()   // 210
  const ph   = doc.internal.pageSize.getHeight()  // 297
  const ml   = 18   // margin left
  const mr   = 18   // margin right
  const cw   = pw - ml - mr   // content width = 174

  let y = 0  // current Y cursor

  // ── 1. Header area ─────────────────────────────────────────────────────────
  const headerH = 36

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.25)
  doc.line(ml, headerH - 2, pw - mr, headerH - 2)

  const logo = await loadImage(COMPANY.logo)
  if (logo) {
    const maxW = 30, maxH = 25
    const ratio = Math.min(maxW / logo.w, maxH / logo.h)
    const lw = logo.w * ratio
    const lh = logo.h * ratio
    const ly = (headerH - lh) / 2
    doc.addImage(logo.dataUrl, 'PNG', ml, ly, lw, lh)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setColor(doc, C.text)
    doc.text(COMPANY.name, ml, 16)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setColor(doc, C.text)
  doc.text('INVOICE', pw - mr, 16, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(doc, C.muted)
  doc.text('Invoice No.', pw - mr, 23, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, C.teal)
  doc.text(invoice.number || '—', pw - mr, 29, { align: 'right' })

  y = headerH + 10

  // ── 2. Bill-to + dates row ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)
  doc.text('FROM', ml, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text)
  doc.text(COMPANY.name, ml, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  y += 4.5; doc.text(COMPANY.address, ml, y)
  y += 4;   doc.text(COMPANY.city,    ml, y)
  y += 4;   doc.text(COMPANY.phone,   ml, y)
  if (COMPANY.gst) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    setColor(doc, C.text)
    doc.text(`GST #: ${COMPANY.gst}`, ml, y)
  }

  let ry = headerH + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)
  doc.text('BILL TO', (ml + cw * 0.42), ry)

  ry += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text)
  doc.text(customer?.name || '—', (ml + cw * 0.42), ry)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  if (customer?.email)   { ry += 4.5; doc.text(customer.email, (ml + cw * 0.42), ry) }
  if (customer?.phone)   { ry += 4;   doc.text(customer.phone, (ml + cw * 0.42), ry) }
  if (customer?.address) { ry += 4;   doc.text(customer.address, (ml + cw * 0.42), ry) }

  const cityLine = [
    customer?.city,
    customer?.province,
    customer?.postal_code
  ].filter(Boolean).join(', ')

  if (cityLine) {
    ry += 4;
    doc.text(cityLine, (ml + cw * 0.42), ry)
  }

  const col3x = pw - mr

  let dy = headerH + 10
  const dateRows = [
    ['Issue Date', fmtDate(invoice.date)],
    ['Due Date',   invoice.due_date ? fmtDate(invoice.due_date) : 'Net 30'],
    ...(invoice.po_number ? [['PO Number', invoice.po_number]] : []),
  ]
  dateRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setColor(doc, C.light)
    doc.text(label, col3x, dy, { align: 'right' })
    dy += 4.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setColor(doc, C.text)
    doc.text(value, col3x, dy, { align: 'right' })
    dy += 7
  })

  y = Math.max(y, ry, dy) + 8

  // ── 3. Divider ─────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── 4. Items table ─────────────────────────────────────────────────────────
  const showDiscount = items.some(i => i.discount_value > 0 && i.discount_type !== 'none');

  const cols = showDiscount
    ? {
        desc:     { x: ml,               w: cw * 0.38, align: 'left'  },
        qty:      { x: ml + cw * 0.38,   w: cw * 0.10, align: 'right' },
        price:    { x: ml + cw * 0.48,   w: cw * 0.17, align: 'right' },
        discount: { x: ml + cw * 0.65,   w: cw * 0.16, align: 'right' },
        amt:      { x: ml + cw * 0.81,   w: cw * 0.19, align: 'right' },
      }
    : {
        desc:  { x: ml,             w: cw * 0.50, align: 'left'  },
        qty:   { x: ml + cw * 0.50, w: cw * 0.10, align: 'right' },
        price: { x: ml + cw * 0.60, w: cw * 0.20, align: 'right' },
        amt:   { x: ml + cw * 0.80, w: cw * 0.20, align: 'right' },
      };
  const colRight = (col) => col.x + col.w

  const thH = 7
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, thH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)

  const headers = showDiscount
    ? [
        ['DESCRIPTION', cols.desc,  'left'],
        ['QTY',         cols.qty,   'right'],
        ['UNIT PRICE',  cols.price, 'right'],
        ['DISCOUNT',    cols.discount, 'right'],
        ['AMOUNT',      cols.amt,   'right'],
      ]
    : [
        ['DESCRIPTION', cols.desc,  'left'],
        ['QTY',         cols.qty,   'right'],
        ['UNIT PRICE',  cols.price, 'right'],
        ['AMOUNT',      cols.amt,   'right'],
      ];

  headers.forEach(([label, col, align]) => {
    const tx = align === 'right' ? colRight(col) - 1 : col.x + 1
    doc.text(label, tx, y + 4.8, { align })
  })

  y += thH

  // Item rows
  const rowH = 8
  items.forEach((item, i) => {
    const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0)
    const lineDiscount = calcLineDiscount(item)
    const lineTotal    = calcLineTotal(item)

    const productName = item.product_id ? productMap.get(item.product_id) : null

    const descLines = doc.splitTextToSize(String(item.name || ''), cols.desc.w - 2)
    const productLineH = productName ? 4.2 : 0
    const dynamicRowH = Math.max(rowH, descLines.length * 4.5 + 3 + productLineH)

    if (y + dynamicRowH > ph - 30) {
      doc.addPage()
      y = 20
    }

    const bg = i % 2 === 0 ? C.white : [248, 250, 252]
    setColor(doc, bg, 'fill')
    doc.rect(ml, y, cw, dynamicRowH, 'F')

    let textY = y + 5.2

    if (productName) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(productName, cols.desc.x + 1, textY)
      textY += 4.2
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, productName ? C.muted : C.text)
    doc.text(descLines, cols.desc.x + 1, textY)

    const midY = y + dynamicRowH / 2 + 1.5

    setColor(doc, C.muted)
    doc.text(String(item.quantity || ''), colRight(cols.qty) - 1, midY, { align: 'right' })
    doc.text(fmt(item.unit_price), colRight(cols.price) - 1, midY, { align: 'right' })

    if (showDiscount) {
      if (lineDiscount > 0) {
        setColor(doc, C.green)
        const discLabel = item.discount_type === 'percent'
          ? `-${item.discount_value}%`
          : `-${fmt(item.discount_value)}`
        doc.text(discLabel, colRight(cols.discount) - 1, midY, { align: 'right' })
      } else {
        setColor(doc, C.light)
        doc.text('—', colRight(cols.discount) - 1, midY, { align: 'right' })
      }
    }

    if (lineDiscount > 0) {
      setColor(doc, C.light)
      doc.setFontSize(7)
      const origText = fmt(lineSubtotal)
      const origX = colRight(cols.amt) - 1
      doc.text(origText, origX, midY - 2, { align: 'right' })
      const textW = doc.getTextWidth(origText)
      doc.setDrawColor(...C.light)
      doc.setLineWidth(0.3)
      doc.line(origX - textW, midY - 2.5, origX, midY - 2.5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(fmt(lineTotal), origX, midY + 2, { align: 'right' })
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(fmt(lineTotal), colRight(cols.amt) - 1, midY, { align: 'right' })
    }

    y += dynamicRowH
  })

  // Bottom border of table
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── 5. Totals block ────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

  const totalPaid   = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const balanceDue  = total - totalPaid
  const fullyPaid   = totalPaid > 0 && balanceDue <= 0.005

  // Row shape: [label, value, isGrand, isPaidGreen]
  const totRows = [
    ['Subtotal', fmt(subtotal), false, false],
    ['Tax (5%)', fmt(tax), false, false],
  ]

  if (totalPaid > 0) {
    totRows.push(['Total', fmt(total), false, false])
    totRows.push(['Amount Paid', `-${fmt(totalPaid)}`, false, true])
    totRows.push([
      fullyPaid ? 'Paid in Full' : 'Balance Due',
      fullyPaid ? '✓ Paid in Full' : fmt(balanceDue),
      true,
      fullyPaid,
    ])
  } else {
    totRows.push(['Total Due', fmt(total), true, false])
  }

  const labelX = pw - mr - 70
  const valueX = pw - mr

  // Check page space for totals block before drawing
  const estTotalsH = totRows.reduce((h, [, , isGrand]) => h + (isGrand ? 14 : 6), 0)
  if (y + estTotalsH > ph - 40) {
    doc.addPage()
    y = 20
  }

  totRows.forEach(([label, value, isGrand, isPaidGreen]) => {
    if (isGrand) {
      y += 2
      setColor(doc, C.tealLight, 'fill')
      doc.rect(labelX - 4, y - 4, 70 + 4, 10, 'F')

      const grandColor = isPaidGreen ? C.green : C.teal

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setColor(doc, grandColor)
      doc.text(label, labelX, y + 2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      setColor(doc, grandColor)
      doc.text(value, valueX, y + 2.5, { align: 'right' })
      y += 14
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      setColor(doc, C.muted)
      doc.text(label, labelX, y)
      setColor(doc, isPaidGreen ? C.green : C.text)
      doc.text(value, valueX, y, { align: 'right' })
      y += 6
    }
  })

  // ── 5b. Payment history (mirrors PaymentsSection.jsx) ──────────────────────
  if (payments.length > 0) {
    y += 6

    if (y + 10 > ph - 40) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.teal)
    doc.text('PAYMENTS RECEIVED', ml, y)
    y += 5

    const METHOD_LABELS = {
      card:      'Card',
      cash:      'Cash',
      cheque:    'Cheque',
      etransfer: 'e-Transfer',
      other:     'Other',
    }

    payments.forEach((p) => {
      if (y + 6 > ph - 30) {
        doc.addPage()
        y = 20
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(METHOD_LABELS[p.method] || p.method || 'Payment', ml, y)

      setColor(doc, C.muted)
      doc.setFontSize(7.5)
      doc.text(fmtDate(p.payment_date), ml + 30, y)

      if (p.note) {
        doc.setFont('helvetica', 'italic')
        setColor(doc, C.light)
        const noteLines = doc.splitTextToSize(`"${p.note}"`, cw * 0.4)
        doc.text(noteLines, ml + 62, y)
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.green)
      doc.text(fmt(p.amount), pw - mr, y, { align: 'right' })

      y += 5.5
    })
  }

  // ── 6. Notes ────────────────────────────────────────────────────────────────
  if (invoice.notes && invoice.notes.trim() !== '') {
    y += 6

    if (y + 10 > ph - 30) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.teal)
    doc.text('NOTES', ml, y)

    y += 4

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted)

    const maxWidth = pw - ml - mr
    const lines = doc.splitTextToSize(invoice.notes, maxWidth)

    doc.text(lines, ml, y)

    y += lines.length * 4
  }

  // ── 7. Footer ──────────────────────────────────────────────────────────────
  const footerY = ph - 16
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text('Thank you for your business.', pw / 2, footerY + 5, { align: 'center' })

  doc.text(COMPANY.name + '  ·  ' + COMPANY.phone, pw / 2, footerY + 9.5, { align: 'center' })

  // ── 8. Save ────────────────────────────────────────────────────────────────
  const filename = `${invoice.number || 'invoice'}-${customer?.name?.replace(/\s+/g, '-') || 'invoice'}.pdf`
  doc.save(filename)
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}