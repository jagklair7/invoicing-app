// src/utils/exportInvoicePDF.js
import { calcLineTotal, calcLineDiscount } from './discount'
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
  green:     [5,   150, 105],
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

export async function exportInvoicePDF(invoice, customer, items) {
  // ── Fetch org settings ────────────────────────────────────────────────────
  const { data: settingsData } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('org_id', invoice.org_id)
    .single()

  const COMPANY = {
    name:       settingsData?.company_name     || 'Klair Computer Inc.',
    address:    settingsData?.company_address  || '1319 Malone Pl NW',
    city:       settingsData?.company_city     || 'Edmonton, AB T6R 0G6',
    phone:      settingsData?.company_phone    || '780-265-0042',
    logo:       settingsData?.company_logo_url || '/icon.png',
    gstNumber:  settingsData?.gst_number       || '',   // ← NEW
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pw  = doc.internal.pageSize.getWidth()
  const ph  = doc.internal.pageSize.getHeight()
  const ml  = 18
  const mr  = 18
  const cw  = pw - ml - mr
  let y = 0

  // ── 1. Header band ──────────────────────────────────────────────────────
  const headerH = 42
  setColor(doc, C.slate, 'fill')
  doc.rect(0, 0, pw, headerH, 'F')

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
    setColor(doc, C.white)
    doc.text(COMPANY.name, ml, 16)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setColor(doc, C.white)
  doc.text('INVOICE', pw - mr, 16, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(doc, [148, 163, 184])
  doc.text('Invoice No.', pw - mr, 23, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, C.white)
  doc.text(invoice.number || '—', pw - mr, 29, { align: 'right' })

  y = headerH + 10

  // ── 2. Bill-to + dates row ──────────────────────────────────────────────
  // FROM (company)
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
  if (COMPANY.address) { y += 4.5; doc.text(COMPANY.address, ml, y) }
  if (COMPANY.city)    { y += 4;   doc.text(COMPANY.city,    ml, y) }
  if (COMPANY.phone)   { y += 4;   doc.text(COMPANY.phone,   ml, y) }

  // ← GST# under phone
  if (COMPANY.gstNumber) {
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted)
    doc.text(`GST #: ${COMPANY.gstNumber}`, ml, y)
  }

  // BILL TO
  const col2x = ml + cw * 0.42
  let ry = headerH + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)
  doc.text('BILL TO', col2x, ry)

  ry += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text)
  doc.text(customer?.name || '—', col2x, ry)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  if (customer?.email)   { ry += 4.5; doc.text(customer.email,   col2x, ry) }
  if (customer?.phone)   { ry += 4;   doc.text(customer.phone,   col2x, ry) }
  if (customer?.address) { ry += 4;   doc.text(customer.address, col2x, ry) }

  const cityLine = [customer?.city, customer?.province, customer?.postal_code]
    .filter(Boolean).join(', ')
  if (cityLine) { ry += 4; doc.text(cityLine, col2x, ry) }

  // Dates — right column
  const col3x = pw - mr
  let dy = headerH + 10

  const dateRows = [
    ['Issue Date', fmtDate(invoice.date)],
    ['Due Date',   invoice.due_date ? fmtDate(invoice.due_date) : 'Net 30'],
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

  // ── 3. Divider ──────────────────────────────────────────────────────────
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── 4. Items table ──────────────────────────────────────────────────────
  const showDiscount = items.some(i => i.discount_value > 0 && i.discount_type !== 'none')

  const cols = showDiscount ? {
    desc:     { x: ml,             w: cw * 0.38, align: 'left'  },
    qty:      { x: ml + cw * 0.38, w: cw * 0.10, align: 'right' },
    price:    { x: ml + cw * 0.48, w: cw * 0.17, align: 'right' },
    discount: { x: ml + cw * 0.65, w: cw * 0.16, align: 'right' },
    amt:      { x: ml + cw * 0.81, w: cw * 0.19, align: 'right' },
  } : {
    desc:     { x: ml,             w: cw * 0.45, align: 'left'  },
    qty:      { x: ml + cw * 0.45, w: cw * 0.12, align: 'right' },
    price:    { x: ml + cw * 0.57, w: cw * 0.18, align: 'right' },
    amt:      { x: ml + cw * 0.75, w: cw * 0.25, align: 'right' },
  }

  const colRight = (col) => col.x + col.w

  // Table header
  const thH = 7
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, thH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)

  const headers = showDiscount ? [
    ['DESCRIPTION', cols.desc,     'left'],
    ['QTY',         cols.qty,      'right'],
    ['UNIT PRICE',  cols.price,    'right'],
    ['DISCOUNT',    cols.discount, 'right'],
    ['AMOUNT',      cols.amt,      'right'],
  ] : [
    ['DESCRIPTION', cols.desc,  'left'],
    ['QTY',         cols.qty,   'right'],
    ['UNIT PRICE',  cols.price, 'right'],
    ['AMOUNT',      cols.amt,   'right'],
  ]

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

    setColor(doc, i % 2 === 0 ? C.white : [248, 250, 252], 'fill')
    doc.rect(ml, y, cw, rowH, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.text)
    doc.text(String(item.name || ''), cols.desc.x + 1, y + 5.2)

    setColor(doc, C.muted)
    doc.text(String(item.quantity || ''), colRight(cols.qty) - 1,   y + 5.2, { align: 'right' })
    doc.text(fmt(item.unit_price),        colRight(cols.price) - 1, y + 5.2, { align: 'right' })

    if (showDiscount) {
      if (lineDiscount > 0) {
        setColor(doc, C.green)
        const discLabel = item.discount_type === 'percent'
          ? `-${item.discount_value}%`
          : `-${fmt(item.discount_value)}`
        doc.text(discLabel, colRight(cols.discount) - 1, y + 5.2, { align: 'right' })
      } else {
        setColor(doc, C.light)
        doc.text('—', colRight(cols.discount) - 1, y + 5.2, { align: 'right' })
      }
    }

    if (lineDiscount > 0) {
      setColor(doc, C.light)
      doc.setFontSize(7)
      const origText = fmt(lineSubtotal)
      const origX = colRight(cols.amt) - 1
      doc.text(origText, origX, y + 3.5, { align: 'right' })
      const textW = doc.getTextWidth(origText)
      doc.setDrawColor(...C.light)
      doc.setLineWidth(0.3)
      doc.line(origX - textW, y + 3.0, origX, y + 3.0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(fmt(lineTotal), origX, y + 7.2, { align: 'right' })
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setColor(doc, C.text)
      doc.text(fmt(lineTotal), colRight(cols.amt) - 1, y + 5.2, { align: 'right' })
    }
    y += rowH
  })

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── 5. Totals ───────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax
  const labelX   = pw - mr - 70
  const valueX   = pw - mr

  ;[
    ['Subtotal', fmt(subtotal), false],
    ['Tax (5%)', fmt(tax),      false],
    ['Total Due', fmt(total),   true ],
  ].forEach(([label, value, isGrand]) => {
    if (isGrand) {
      y += 2
      setColor(doc, C.tealLight, 'fill')
      doc.rect(labelX - 4, y - 4, 70 + 4, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setColor(doc, C.teal)
      doc.text(label, labelX, y + 2)
      doc.setFontSize(13)
      doc.text(value, valueX, y + 2.5, { align: 'right' })
      y += 14
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      setColor(doc, C.muted)
      doc.text(label, labelX, y)
      setColor(doc, C.text)
      doc.text(value, valueX, y, { align: 'right' })
      y += 6
    }
  })

  // ── 6. Footer ───────────────────────────────────────────────────────────
  const footerY = ph - 16
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text('Thank you for your business.', pw / 2, footerY + 5, { align: 'center' })

  // Footer line: company name · phone · GST# if set
  const footerParts = [COMPANY.name, COMPANY.phone]
  if (COMPANY.gstNumber) footerParts.push(`GST #: ${COMPANY.gstNumber}`)
  doc.text(footerParts.join('  ·  '), pw / 2, footerY + 9.5, { align: 'center' })

  // ── 7. Save ─────────────────────────────────────────────────────────────
  const filename = `${invoice.number || 'invoice'}-${customer?.name?.replace(/\s+/g, '-') || 'invoice'}.pdf`
  doc.save(filename)

  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}