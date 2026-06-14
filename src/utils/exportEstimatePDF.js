// src/utils/exportEstimatePDF.js
// Generates a PDF estimate — identical layout to exportInvoicePDF.js
// but labelled "ESTIMATE" with:
//   - No GST/tax calculated (subtotal = total)
//   - "+GST" notice below total
//   - Quote-appropriate footer
import { jsPDF } from 'jspdf'
import { supabase } from '../app/supabaseClient'

const C = {
  slate:     [146, 201, 192],
  teal:      [13,  115, 119],
  tealLight: [232, 245, 245],
  text:      [30,  41,  59],
  muted:     [100, 116, 139],
  light:     [148, 163, 184],
  border:    [226, 232, 240],
  white:     [255, 255, 255],
  green:     [5, 150, 105],
  orange:    [234, 88, 12],
}

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
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function exportEstimatePDF(estimate, customer, lineItems = [], orgId) {
  const { data: orgRow } = await supabase
    .from('organization_settings')
    .select('company_name, company_address, company_city, company_phone, gst_number, company_logo_url')
    .eq('org_id', orgId)
    .single()

  const COMPANY = {
    name:    orgRow?.company_name    || 'Klair Computer Inc.',
    address: orgRow?.company_address || '1319 Malone Place NW',
    city:    orgRow?.company_city    || 'Edmonton, AB T6R 0G6',
    phone:   orgRow?.company_phone   || '780-265-0042',
    gst:     orgRow?.gst_number      || '',
    logo:    orgRow?.company_logo_url || '/icon.png',
  }

  const items = Array.isArray(lineItems) ? lineItems : []
  const subtotal = estimate.subtotal
    || items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pw  = doc.internal.pageSize.getWidth()
  const ph  = doc.internal.pageSize.getHeight()
  const ml  = 18
  const mr  = 18
  const cw  = pw - ml - mr

  let y = 0

  // ── Header ──────────────────────────────────────────────────────────────────
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
    doc.addImage(logo.dataUrl, 'PNG', ml, (headerH - lh) / 2, lw, lh)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setColor(doc, C.text)
    doc.text(COMPANY.name, ml, 16)
  }

  // "ESTIMATE" label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setColor(doc, C.text)
  doc.text('ESTIMATE', pw - mr, 16, { align: 'right' })

  // Estimate number
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(doc, C.muted)
  doc.text('Estimate No.', pw - mr, 23, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, C.teal)
  doc.text(estimate.estimate_number || '—', pw - mr, 29, { align: 'right' })

  y = headerH + 10

  // ── From ────────────────────────────────────────────────────────────────────
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

  // ── Prepared For ────────────────────────────────────────────────────────────
  let ry = headerH + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)
  doc.text('PREPARED FOR', ml + cw * 0.42, ry)
  ry += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text)
  doc.text(customer?.name || '—', ml + cw * 0.42, ry)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  if (customer?.email)   { ry += 4.5; doc.text(customer.email,   ml + cw * 0.42, ry) }
  if (customer?.phone)   { ry += 4;   doc.text(customer.phone,   ml + cw * 0.42, ry) }
  if (customer?.address) { ry += 4;   doc.text(customer.address, ml + cw * 0.42, ry) }
  const cityLine = [customer?.city, customer?.province, customer?.postal_code].filter(Boolean).join(', ')
  if (cityLine) { ry += 4; doc.text(cityLine, ml + cw * 0.42, ry) }

  // ── Dates ───────────────────────────────────────────────────────────────────
  let dy = headerH + 10
  const col3x = pw - mr
  const dateRows = [
    ['Issue Date',  fmtDate(estimate.issue_date)],
    ['Valid Until', estimate.expiry_date ? fmtDate(estimate.expiry_date) : 'Upon acceptance'],
    ...(estimate.po_number ? [['PO Number', estimate.po_number]] : []),
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

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── Items table ───────────────────────────────────────────────────────────────
  const cols = {
    desc:  { x: ml,             w: cw * 0.50 },
    qty:   { x: ml + cw * 0.50, w: cw * 0.10 },
    price: { x: ml + cw * 0.60, w: cw * 0.20 },
    amt:   { x: ml + cw * 0.80, w: cw * 0.20 },
  }
  const colRight = (col) => col.x + col.w

  const thH = 7
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, thH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)
  ;[
    ['DESCRIPTION', cols.desc,  'left'],
    ['QTY',         cols.qty,   'right'],
    ['UNIT PRICE',  cols.price, 'right'],
    ['AMOUNT',      cols.amt,   'right'],
  ].forEach(([label, col, align]) => {
    const tx = align === 'right' ? colRight(col) - 1 : col.x + 1
    doc.text(label, tx, y + 4.8, { align })
  })
  y += thH

  const rowH = 8
  items.forEach((item, i) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
    const descLines = doc.splitTextToSize(String(item.name || ''), cols.desc.w - 2)
    const dynamicRowH = Math.max(rowH, descLines.length * 4.5 + 3)

    if (y + dynamicRowH > ph - 50) { doc.addPage(); y = 20 }

    const bg = i % 2 === 0 ? C.white : [248, 250, 252]
    setColor(doc, bg, 'fill')
    doc.rect(ml, y, cw, dynamicRowH, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.text)
    doc.text(descLines, cols.desc.x + 1, y + 5.2)

    const midY = y + dynamicRowH / 2 + 1.5
    setColor(doc, C.muted)
    doc.text(String(item.quantity || ''), colRight(cols.qty) - 1, midY, { align: 'right' })
    doc.text(fmt(item.unit_price), colRight(cols.price) - 1, midY, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    setColor(doc, C.text)
    doc.text(fmt(lineTotal), colRight(cols.amt) - 1, midY, { align: 'right' })

    y += dynamicRowH
  })

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── Totals (no GST) ───────────────────────────────────────────────────────
  const labelX = pw - mr - 70
  const valueX = pw - mr

  if (items.length > 1) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted)
    doc.text('Subtotal', labelX, y)
    setColor(doc, C.text)
    doc.text(fmt(subtotal), valueX, y, { align: 'right' })
    y += 8
  }

  // Grand total strip
  setColor(doc, C.tealLight, 'fill')
  doc.rect(labelX - 4, y - 4, 70 + 4, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(doc, C.teal)
  doc.text('Estimate Total', labelX, y + 2)
  doc.setFontSize(13)
  doc.text(fmt(subtotal), valueX, y + 2.5, { align: 'right' })
  y += 14

  // +GST notice
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  setColor(doc, C.orange)
  doc.text('* Prices are exclusive of GST (5%). GST will be added at time of invoicing.', valueX, y, { align: 'right' })
  y += 10

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (estimate.notes?.trim()) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.teal)
    doc.text('NOTES', ml, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted)
    const lines = doc.splitTextToSize(estimate.notes, pw - ml - mr)
    doc.text(lines, ml, y)
    y += lines.length * 4.5
  }

  // ── Validity + acceptance notice ───────────────────────────────────────────
  y += 8
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, y, pw - mr, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted)
  const validityText = estimate.expiry_date
    ? `This estimate is valid until ${fmtDate(estimate.expiry_date)}. Prices are subject to change after this date.`
    : 'This estimate is valid upon acceptance. Prices are subject to change.'
  const validityLines = doc.splitTextToSize(validityText, pw - ml - mr)
  doc.text(validityLines, ml, y)

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = ph - 18
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  setColor(doc, C.teal)
  doc.text(
    'Thank you for the opportunity to quote. We look forward to working with you.',
    pw / 2, footerY + 5, { align: 'center' }
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(doc, C.light)
  doc.text(COMPANY.name + '  ·  ' + COMPANY.phone, pw / 2, footerY + 10, { align: 'center' })

  // ── Save ───────────────────────────────────────────────────────────────────
  const filename = `${estimate.estimate_number || 'estimate'}-${customer?.name?.replace(/\s+/g, '-') || 'estimate'}.pdf`
  doc.save(filename)
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}
