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