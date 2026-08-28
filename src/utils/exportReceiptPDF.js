// src/utils/exportReceiptPDF.js
// Generates a clean, vector PDF receipt for a single payment using jsPDF.
// Mirrors exportInvoicePDF.js styling and structure.
//
// Usage: await exportReceiptPDF(payment, invoice, customer, orgId)
import { jsPDF } from 'jspdf'
import { supabase } from '../app/supabaseClient'

// ── Colours (matches exportInvoicePDF.js) ───────────────────────────────────
const C = {
  teal:      [13,  115, 119],
  tealLight: [232, 245, 245],
  text:      [30,  41,  59],
  muted:     [100, 116, 139],
  light:     [148, 163, 184],
  border:    [226, 232, 240],
  white:     [255, 255, 255],
  green:     [5, 150, 105],
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

const METHOD_LABELS = {
  card:      'Card',
  cash:      'Cash',
  cheque:    'Cheque',
  etransfer: 'e-Transfer',
  other:     'Other',
}

// ── Main export function ──────────────────────────────────────────────────────
export async function exportReceiptPDF(payment, invoice, customer, orgId) {
  // Fetch all payments on this invoice to compute balance remaining
  const { data: allPayments } = await supabase
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', invoice.id)
    .eq('org_id', orgId)

  const totalPaid  = (allPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const balanceDue = Math.max((invoice.total || 0) - totalPaid, 0)

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
    gst:     orgRow?.gst_number      || '831146329',
    logo:    orgRow?.company_logo_url || '/icon.png',
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const ml = 18
  const mr = 18
  const cw = pw - ml - mr

  let y = 0
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
  doc.text('RECEIPT', pw - mr, 16, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(doc, C.muted)
  doc.text('For Invoice', pw - mr, 23, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, C.teal)
  doc.text(invoice.number || '—', pw - mr, 29, { align: 'right' })

  y = headerH + 10

  // ── From / Received From ────────────────────────────────────────────────
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
  doc.text('RECEIVED FROM', (ml + cw * 0.42), ry)

  ry += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text)
  doc.text(customer?.name || '—', (ml + cw * 0.42), ry)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  if (customer?.email) { ry += 4.5; doc.text(customer.email, (ml + cw * 0.42), ry) }
  if (customer?.phone) { ry += 4;   doc.text(customer.phone, (ml + cw * 0.42), ry) }

  const col3x = pw - mr
  let dy = headerH + 10
  const dateRows = [
    ['Payment Date', fmtDate(payment.payment_date)],
    ['Method',       METHOD_LABELS[payment.method] || payment.method || '—'],
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

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 10

  // ── Amount received block ───────────────────────────────────────────────
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, 18, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.muted)
  doc.text('AMOUNT RECEIVED', ml + 4, y + 7)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  setColor(doc, C.green)
  doc.text(fmt(payment.amount), pw - mr - 4, y + 12, { align: 'right' })

  y += 26

  if (payment.note) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    setColor(doc, C.light)
    const noteLines = doc.splitTextToSize(`Note: "${payment.note}"`, cw)
    doc.text(noteLines, ml, y)
    y += noteLines.length * 4 + 4
  }

  // ── Invoice totals recap ────────────────────────────────────────────────
  const labelX = pw - mr - 70
  const valueX = pw - mr

  const recapRows = [
    ['Invoice Total', fmt(invoice.total), false, false],
    ['Total Paid to Date', fmt(totalPaid), false, true],
  ]

  recapRows.forEach(([label, value, , isPaidGreen]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted)
    doc.text(label, labelX, y)
    setColor(doc, isPaidGreen ? C.green : C.text)
    doc.text(value, valueX, y, { align: 'right' })
    y += 6
  })

  y += 2
  const fullyPaid = balanceDue <= 0.005
  setColor(doc, C.tealLight, 'fill')
  doc.rect(labelX - 4, y - 4, 70 + 4, 10, 'F')
  const grandColor = fullyPaid ? C.green : C.teal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(doc, grandColor)
  doc.text(fullyPaid ? 'Paid in Full' : 'Balance Due', labelX, y + 2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(doc, grandColor)
  doc.text(fullyPaid ? ' ' : fmt(balanceDue), valueX, y + 2.5, { align: 'right' })
  y += 14

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = ph - 16
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text('Thank you for your payment.', pw / 2, footerY + 5, { align: 'center' })
  doc.text(COMPANY.name + '  ·  ' + COMPANY.phone, pw / 2, footerY + 9.5, { align: 'center' })

  const filename = `receipt-${invoice.number || 'invoice'}-${fmtDate(payment.payment_date)}.pdf`
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}