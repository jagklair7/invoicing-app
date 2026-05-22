// src/utils/exportInvoicePDF.js
// Generates a clean, vector PDF invoice with logo using jsPDF.
// No html2canvas — draws everything as real PDF text/shapes so it's sharp at any zoom.
//
// Install:  npm install jspdf
// Usage:    import { exportInvoicePDF } from '../utils/exportInvoicePDF'
//           await exportInvoicePDF(invoice, customer, items)
import { calcLineTotal, calcLineDiscount } from './discount'
import { jsPDF } from 'jspdf'

// ── Company info ─────────────────────────────────────────────────────────────
//const COMPANY = {
  //name:    'Klair Computer Inc.',
  //address: '1319 Malone Place NW',
  //city:    'Edmonton, AB T6R 0G6',
  //phone:   '780-265-0042',
  //logo:    '/icon.png',   // from /public — served at root in Vite
//}
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
  green:     [5, 150, 105], // ✅ add this

  /* Core neutrals (rich, not washed out)
  ink:        [28, 28, 30],     // near-black (better than pure black)
  charcoal:   [55, 65, 81],     // headings
  slate:      [100, 116, 139],  // secondary text
  light:      [203, 213, 225],  // subtle labels
  border:     [226, 232, 240],
  paper:      [255, 255, 255],

  // Brand accents (luxury teal + gold)
  deepTeal:   [13, 64, 66],     // darker, richer teal
  teal:       [15, 118, 110],   // refined teal (less bright)
  tealSoft:   [224, 242, 241],  // very soft background

  gold:       [180, 138, 58],   // muted gold (not yellow)
  goldSoft:   [245, 232, 199],  // subtle highlight

  success:    [22, 163, 74],    // cleaner green
  danger:     [185, 28, 28], */
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) : '—'

//function setColor(doc, rgb, type = 'text') {
//  if (type === 'fill') doc.setFillColor(...rgb)
//  else doc.setTextColor(...rgb)
//}
function setColor(doc, rgb, type = 'text') {
  const safe = Array.isArray(rgb) ? rgb : [0, 0, 0]

  if (type === 'fill') doc.setFillColor(...safe)
  else doc.setTextColor(...safe)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
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
export async function exportInvoicePDF(invoice, customer, items, orgId) {
  const hasAnyDiscount = items.some(i => i.discount_value > 0 && i.discount_type !== 'none')

  const { data: orgRow } = await supabase
    .from('organization_settings')
    .select('company_name, company_address, company_city, company_phone, gst_number, company_logo_url')
    .eq('org_id', orgId)
    .single()
    

  // Use an empty array fallback [] to prevent "map/forEach of undefined" errors
 // const settings = (settingsData || []).reduce((acc, item) => {
 //  acc[item.key] = item.value;
//    return acc;
//  }, {});

 /* const COMPANY = {
    name:    settings.company_name || 'Klair Computer Inc.',
    address: settings.company_address || '1319 Malone Place NW',
    city:    settings.company_city || 'Edmonton, AB T6R 0G6',
    phone:   settings.company_phone || '780-265-0042',
    logo:    settings.company_logo_url || '/icon.png',   // from /public — served at root in Vite', 
  } */

    const COMPANY = {
    name:    orgRow?.company_name    || 'Klair Computer Inc.',
    address: orgRow?.company_address || '1319 Malone Place NW',
    city:    orgRow?.company_city    || 'Edmonton, AB T6R 0G6',
    phone:   orgRow?.company_phone   || '780-265-0042',
    gst:     orgRow?.gst_number      || '831146329',
    logo:    orgRow?.company_logo_url || '/icon.png',
  }

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

  // Top divider line for a clean header layout
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.25)
  doc.line(ml, headerH - 2, pw - mr, headerH - 2)

  // Try to load logo
  const logo = await loadImage(COMPANY.logo)
  if (logo) {
    // Max logo size: 28mm wide, 18mm tall — maintain aspect ratio
    const maxW = 30, maxH = 25  // A4 at 72dpi is 210x297 pixels → 28mm ≈ 67.73px, 18mm ≈ 67.73px
    const ratio = Math.min(maxW / logo.w, maxH / logo.h)
    const lw = logo.w * ratio
    const lh = logo.h * ratio
    const ly = (headerH - lh) / 2
    doc.addImage(logo.dataUrl, 'PNG', ml, ly, lw, lh)
  } else {
    // Fallback: text logo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setColor(doc, C.text)
    doc.text(COMPANY.name, ml, 16)
  }

  // "INVOICE" label — right side of header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setColor(doc, C.text)
 // setColor(doc, C.gold) 
  doc.text('INVOICE', pw - mr, 16, { align: 'right' })

  // Invoice number under it
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(doc, C.muted)
  doc.text('Invoice No.', pw - mr, 23, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, C.teal)
  doc.text(invoice.number || '—', pw - mr, 29, { align: 'right' })

  // Status badge
  const statusColors = {
    paid:  [5,  150, 105],
    sent:  [37, 99,  235],
    void:  [220,38,  38],
    draft: [100,116, 139],
  }
  const statusLabel = (invoice.status || 'draft').toUpperCase()
  const sBg = statusColors[invoice.status] || statusColors.draft
  const badgeW = 20, badgeH = 5.5
  const bx = pw - mr - badgeW
  const by = 32
  //doc.setFillColor(...sBg.map(c => Math.min(c + 160, 255)))  // light tint
 // doc.roundedRect(bx, by, badgeW, badgeH, 2, 2, 'F')
 // doc.setFont('helvetica', 'bold')
 // doc.setFontSize(7)
//  doc.setTextColor(...sBg)
 // doc.text(statusLabel, bx + badgeW / 2, by + 3.7, { align: 'center' })

  y = headerH + 10

  // ── 2. Bill-to + dates row ─────────────────────────────────────────────────
  // Left: From (company)
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

  // Right col: Bill To
  const col2x = ml + cw * 0.42

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
  
  // Combine City, Province, and Postal Code on one line
  const cityLine = [
    customer?.city, 
    customer?.province, 
    customer?.postal_code
  ].filter(Boolean).join(', ')

  if (cityLine) {
    ry += 4;
    doc.text(cityLine, (ml + cw * 0.42), ry)
  }

  // Far right: Dates
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
  // Column config
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

  // Table header row
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
  // Replace the item rows forEach with this:
items.forEach((item, i) => {
  const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0)
  const lineDiscount = calcLineDiscount(item)
  const lineTotal    = calcLineTotal(item)

  // Wrap description text to column width
  const descLines = doc.splitTextToSize(String(item.name || ''), cols.desc.w - 2)
  const dynamicRowH = Math.max(rowH, descLines.length * 4.5 + 3)

  // Check if we need a new page
  if (y + dynamicRowH > ph - 30) {
    doc.addPage()
    y = 20
  }

  const bg = i % 2 === 0 ? C.white : [248, 250, 252]
  setColor(doc, bg, 'fill')
  doc.rect(ml, y, cw, dynamicRowH, 'F')

  // Description — wrapped, vertically centered
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.text)
  doc.text(descLines, cols.desc.x + 1, y + 5.2)

  // Other columns — vertically centered in dynamic row
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
  /*items.forEach((item, i) => {
  const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0)
  const lineDiscount = calcLineDiscount(item)
  const lineTotal    = calcLineTotal(item)

  const bg = i % 2 === 0 ? C.white : [248, 250, 252]
  setColor(doc, bg, 'fill')
  doc.rect(ml, y, cw, rowH, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.text)
  doc.text(String(item.name || ''), cols.desc.x + 1, y + 5.2)

  setColor(doc, C.muted)
  doc.text(String(item.quantity || ''), colRight(cols.qty) - 1, y + 5.2, { align: 'right' })
  doc.text(fmt(item.unit_price), colRight(cols.price) - 1, y + 5.2, { align: 'right' })

  // Discount column
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

  // Amount — strikethrough original if discounted
  if (lineDiscount > 0) {
    setColor(doc, C.light)
    doc.setFontSize(7)
    const origText = fmt(lineSubtotal)
    const origX = colRight(cols.amt) - 1
    doc.text(origText, origX, y + 3.5, { align: 'right' })
    // Draw strikethrough line
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
}) */

  // Bottom border of table
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── 5. Totals block ────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

  const totRows = [
    ['Subtotal', fmt(subtotal), false],
    ['Tax (5%)', fmt(tax),      false],
    ['Total Due', fmt(total),   true ],
  ]

  const labelX = pw - mr - 70
  const valueX = pw - mr

  totRows.forEach(([label, value, isGrand], i) => {
    if (isGrand) {
      // Teal background strip for grand total
      y += 2
      setColor(doc, C.tealLight, 'fill')
      doc.rect(labelX - 4, y - 4, 70 + 4, 10, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setColor(doc, C.teal)
      doc.text(label, labelX, y + 2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      setColor(doc, C.teal)
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

  // ── 6. Notes ────────────────────────────────────────────────────────────────
if (invoice.notes && invoice.notes.trim() !== '') {
  y += 6

  // Section label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, C.teal)
  doc.text('NOTES', ml, y)

  y += 4

  // Notes content (wrapped text)
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

  /*GST number line
if (COMPANY.gst) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(doc, C.muted)
  doc.text(`GST #: ${COMPANY.gst}`, ml, footerY + 5)
} */
  doc.text(COMPANY.name + '  ·  ' + COMPANY.phone, pw / 2, footerY + 9.5, { align: 'center' })

  // ── 7. Save ────────────────────────────────────────────────────────────────
  const filename = `${invoice.number || 'invoice'}-${customer?.name?.replace(/\s+/g, '-') || 'invoice'}.pdf`
  doc.save(filename)
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }

   /*await fetch('/api/send-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: customer.email,
      subject: `Invoice ${invoice.number}`,
      pdfBase64,
      filename
    })
  }) */
}
