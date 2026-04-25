// src/utils/exportStatementPDF.js
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
  red:       [229, 62,  62],
  amber:     [217, 119, 6],
  green:     [5,   150, 105],
}

const fmt     = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

function setColor(doc, rgb, type = 'text') {
  if (type === 'fill') doc.setFillColor(...rgb)
  else doc.setTextColor(...rgb)
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

export async function exportStatementPDF(customer, invoices, dateFrom, dateTo) {
  // 1. Fetch settings
  const { data: settingsData } = await supabase.from('settings').select('key, value')
  const settings = (settingsData || []).reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {})

  const COMPANY = {
    name:    settings.company_name    || 'Klair Computer Inc.',
    address: settings.company_address || '1319 Malone Place NW',
    city:    settings.company_city    || 'Edmonton, AB T6R 0G6',
    phone:   settings.company_phone   || '780-265-0042',
    logo:    settings.company_logo_url || '/icon.png',
  }

  // 2. Init doc
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pw  = doc.internal.pageSize.getWidth()
  const ph  = doc.internal.pageSize.getHeight()
  const ml  = 18
  const mr  = 18
  const cw  = pw - ml - mr

  let y = 0

  // ── Header band ────────────────────────────────────────────────────────────
  const headerH = 42
  setColor(doc, C.slate, 'fill')
  doc.rect(0, 0, pw, headerH, 'F')

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
    setColor(doc, C.white)
    doc.text(COMPANY.name, ml, 16)
  }

  // "STATEMENT" label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setColor(doc, C.white)
  doc.text('STATEMENT', pw - mr, 16, { align: 'right' })

  // Period label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text(`Period: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`, pw - mr, 24, { align: 'right' })
  doc.text(`Prepared: ${fmtDate(new Date().toISOString().split('T')[0])}`, pw - mr, 29, { align: 'right' })

  y = headerH + 10

  // ── From + Bill To + Summary ───────────────────────────────────────────────
  // FROM (left col)
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

  // BILL TO (middle col)
  const col2x = ml + cw * 0.38
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
  const cityLine = [customer?.city, customer?.province, customer?.postal_code].filter(Boolean).join(', ')
  if (cityLine) { ry += 4; doc.text(cityLine, col2x, ry) }

  // ACCOUNT SUMMARY (right col — 3 boxes)
  const today = new Date(); today.setHours(0,0,0,0)
  const totalInvoiced    = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalPaid        = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid
  const totalOverdue     = invoices
    .filter(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < today)
    .reduce((s, i) => s + Number(i.total || 0), 0)

  const col3x   = ml + cw * 0.68
  const boxW    = (pw - mr - col3x) / 3 - 1.5
  let   by      = headerH + 10
  const summaryItems = [
    { label: 'Invoiced',    value: fmt(totalInvoiced),    color: C.teal  },
    { label: 'Outstanding', value: fmt(totalOutstanding), color: C.amber },
    { label: 'Overdue',     value: fmt(totalOverdue),     color: C.red   },
  ]

  summaryItems.forEach((item, i) => {
    const bx = col3x + i * (boxW + 1.5)
    // Box bg
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(bx, by, boxW, 16, 1.5, 1.5, 'F')
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.2)
    doc.roundedRect(bx, by, boxW, 16, 1.5, 1.5, 'S')
    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    setColor(doc, C.light)
    doc.text(item.label.toUpperCase(), bx + boxW / 2, by + 5, { align: 'center' })
    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setColor(doc, item.color)
    doc.text(item.value, bx + boxW / 2, by + 11.5, { align: 'center' })
  })

  y = Math.max(y, ry, by + 16) + 8

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── Invoice table ──────────────────────────────────────────────────────────
  const cols = {
    num:    { x: ml,              w: cw * 0.16 },
    date:   { x: ml + cw * 0.16, w: cw * 0.17 },
    due:    { x: ml + cw * 0.33, w: cw * 0.17 },
    status: { x: ml + cw * 0.50, w: cw * 0.16 },
    amt:    { x: ml + cw * 0.66, w: cw * 0.17 },
    bal:    { x: ml + cw * 0.83, w: cw * 0.17 },
  }
  const colRight = (col) => col.x + col.w

  // Table header
  const thH = 7
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, thH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)

  const headers = [
    ['INVOICE #', cols.num,    'left'],
    ['DATE',      cols.date,   'left'],
    ['DUE DATE',  cols.due,    'left'],
    ['STATUS',    cols.status, 'left'],
    ['AMOUNT',    cols.amt,    'right'],
    ['BALANCE',   cols.bal,    'right'],
  ]
  headers.forEach(([label, col, align]) => {
    const tx = align === 'right' ? colRight(col) - 1 : col.x + 1
    doc.text(label, tx, y + 4.8, { align })
  })
  y += thH

  // Rows
  const rowH = 8
  const statusColors = {
    paid:    C.green,
    sent:    [37, 99, 235],
    draft:   C.light,
    void:    C.red,
    overdue: C.red,
  }

  let runningBalance = 0
  invoices.forEach((inv, i) => {
    const amount = Number(inv.total || 0)
    const isOverdue = inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < today
    const badge = isOverdue ? 'overdue' : inv.status
    if (inv.status !== 'paid') runningBalance += amount

    const bg = i % 2 === 0 ? C.white : [248, 250, 252]
    setColor(doc, bg, 'fill')
    doc.rect(ml, y, cw, rowH, 'F')

    // Invoice #
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.text)
    doc.text(inv.number || '—', cols.num.x + 1, y + 5.2)

    // Date
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(doc, C.muted)
    doc.text(fmtDate(inv.date), cols.date.x + 1, y + 5.2)

    // Due date
    doc.text(inv.due_date ? fmtDate(inv.due_date) : 'Net 30', cols.due.x + 1, y + 5.2)

    // Status badge
    const sColor = statusColors[badge] || C.light
    const badgeLabel = badge.toUpperCase()
    const badgeW = 14, badgeH = 4.5
    const bx = cols.status.x + 1
    doc.setFillColor(...sColor.map(c => Math.min(c + 160, 255)))
    doc.roundedRect(bx, y + 1.8, badgeW, badgeH, 1, 1, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...sColor)
    doc.text(badgeLabel, bx + badgeW / 2, y + 4.8, { align: 'center' })

    // Amount
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.text)
    doc.text(fmt(amount), colRight(cols.amt) - 1, y + 5.2, { align: 'right' })

    // Balance
    const balColor = inv.status === 'paid' ? C.green : runningBalance > 0 ? C.amber : C.text
    const balText  = inv.status === 'paid' ? '—' : fmt(runningBalance)
    setColor(doc, balColor)
    doc.text(balText, colRight(cols.bal) - 1, y + 5.2, { align: 'right' })

    y += rowH
  })

  // Table bottom border
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  // ── Totals ─────────────────────────────────────────────────────────────────
  const labelX = pw - mr - 70
  const valueX = pw - mr

  const totRows = [
    ['Total Invoiced', fmt(totalInvoiced), false],
    ['Total Paid',     `(${fmt(totalPaid)})`, false],
    ['Balance Owing',  fmt(totalOutstanding), true],
  ]

  totRows.forEach(([label, value, isGrand]) => {
    if (isGrand) {
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

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = ph - 16
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text('Please reference your invoice number when making payment. Thank you for your business.', pw / 2, footerY + 5, { align: 'center' })
  doc.text(`${COMPANY.name}  ·  ${COMPANY.phone}`, pw / 2, footerY + 9.5, { align: 'center' })

  // ── Save ───────────────────────────────────────────────────────────────────
  const filename = `statement-${customer?.name?.replace(/\s+/g, '-') || 'customer'}-${dateFrom}-${dateTo}.pdf`
  doc.save(filename)
}