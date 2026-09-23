// supabase/functions/send-invoice/index.ts
//
// Two request shapes are supported:
//
// 1) LEGACY (unchanged) — used by ResendModal / ReminderModal in Invoices.jsx:
//    { to, subject, html, pdfBase64, filename, companyName, orgId }
//    Behaves exactly as before — nothing about this path changed.
//
// 2) LEAN (new) — used by InvoiceView.jsx's "Send Invoice" button:
//    { invoiceId, orgId, to, sendNote?, subject?, companyName? }
//    The function fetches the invoice/customer/items/payments/org settings
//    itself (service-role, bypasses RLS), builds the PDF and email HTML
//    server-side, then falls through into the exact same
//    attachments/Resend/response logic as the legacy path. This means the
//    browser never uploads a multi-hundred-KB base64 PDF over the network —
//    it just sends a tiny JSON body, which is what fixes the "fails on some
//    WiFi networks" issue: large POST bodies were the thing getting dropped.
//
// PAY NOW (new): for the LEAN path, this now computes a customer-facing
// pay link directly from invoice.online_payment_enabled + invoice.public_token
// (the columns InvoiceView.jsx's toggle writes) — NOT from any
// includePayNow/payUrl fields the client might send. The invoice row in the
// database is the source of truth; trusting a client-supplied URL here
// would let a caller inject an arbitrary link into the email/PDF. When
// eligible, the link is drawn into the PDF as a small button right under
// the totals block, and rendered as a "Pay Now" button in the email body.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1'
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

const FROM_EMAIL_OVERRIDE = Deno.env.get('FROM_EMAIL')
const FROM_EMAIL_ADDRESS  = Deno.env.get('FROM_EMAIL_ADDRESS') || 'invoices@digital1now.com'
const DEFAULT_SENDER_NAME = 'Klair'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// FLAG: set this env var on the function if the app's public URL differs —
// confirmed from the "Customer Pay Now link" you shared:
// https://invoice.digital1now.com/i/<token>
const APP_URL = Deno.env.get('APP_URL') || 'https://invoice.digital1now.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Shared formatting helpers (mirrors src/pages/InvoiceView.jsx) ──────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

const fmtDate = (d?: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) : '—'

// Mirrors the canPay check in src/pages/InvoicePublic.jsx exactly, using
// the invoice row's own columns rather than anything the client sent.
function computePayUrl(invoice: any): string | null {
  if (!invoice?.online_payment_enabled) return null
  if (!invoice?.public_token) return null
  if (invoice.status === 'paid' || invoice.status === 'void') return null
  return `${APP_URL}/i/${invoice.public_token}`
}

// ── Discount math ────────────────────────────────────────────────────────────
// Verified against src/utils/discount.js — matches exactly (percent:
// subtotal * value/100, fixed: min(subtotal, value)).
function calcLineSubtotal(item: any) {
  return (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
}
function calcLineDiscount(item: any) {
  const subtotal = calcLineSubtotal(item)
  if (!item.discount_type || item.discount_type === 'none') return 0
  if (item.discount_type === 'percent') return subtotal * (Number(item.discount_value) || 0) / 100
  if (item.discount_type === 'fixed') return Math.min(Number(item.discount_value) || 0, subtotal)
  return 0
}
function calcLineTotal(item: any) {
  return calcLineSubtotal(item) - calcLineDiscount(item)
}

// ── PDF colours (mirrors src/utils/exportInvoicePDF.js) ─────────────────────
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
}

function setColor(doc: any, rgb: number[], type: 'text' | 'fill' = 'text') {
  const safe = Array.isArray(rgb) ? rgb : [0, 0, 0]
  if (type === 'fill') doc.setFillColor(...safe)
  else doc.setTextColor(...safe)
}

// Draws a small, clickable "Pay this invoice online" button right-aligned
// under the totals block (same right edge as the totals value column).
// Mirrors src/utils/exportInvoicePDF.js's drawPayButton exactly — kept in
// sync by hand since this Edge Function can't import that browser file.
// No-ops when payUrl is null. No URL text is printed; the whole button is
// a doc.link() hotspot (same trade-off flagged in exportInvoicePDF.js: PDF
// viewers that ignore link annotations have no visible fallback anymore).
function drawPayButton(doc: any, y: number, valueX: number, ph: number, payUrl: string | null) {
  if (!payUrl) return y

  const btnW = 46
  const btnH = 8
  const btnX = valueX - btnW

  if (y + btnH > ph - 30) {
    doc.addPage()
    y = 20
  }

  setColor(doc, C.teal, 'fill')
  doc.roundedRect(btnX, y, btnW, btnH, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, C.white)
  doc.text('Pay this invoice online', btnX + btnW / 2, y + 5.3, { align: 'center' })

  doc.link(btnX, y, btnW, btnH, { url: payUrl })

  return y + btnH + 6
}

function parseColor(str?: string | null): number[] | null {
  if (!str) return null
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])]
  const hexMatch = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    const num = parseInt(hex, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }
  return null
}

// ── Logo loading (Deno-safe replacement for the browser canvas/Image version) ─
// SIMPLIFICATION: only PNG headers are parsed for real width/height. Any
// other format (e.g. JPEG) falls back to a 1:1 square aspect ratio so the
// logo still renders, just possibly stretched. Flag me if your logo isn't a
// PNG and this matters — I can add a JPEG SOF-marker parser too.
function pngDimensions(bytes: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null
  const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  return { w, h }
}

async function loadLogoForPdf(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    const dims = pngDimensions(buf) || { w: 200, h: 200 }
    const contentType = res.headers.get('content-type') || 'image/png'
    const b64 = base64Encode(buf)
    return { dataUrl: `data:${contentType};base64,${b64}`, w: dims.w, h: dims.h }
  } catch {
    return null // logo missing/unreachable → skip gracefully, same as before
  }
}

// ── Rich-text notes parsing (Deno DOMParser instead of browser DOMParser) ───
const ELEMENT_NODE = 1
const TEXT_NODE = 3

function parseNotesHtml(html: string) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const paragraphs: any[][] = []
  let current: any[] = []

  function walk(node: any, style: any) {
    if (node.nodeType === TEXT_NODE) {
      if (node.textContent) current.push({ text: node.textContent, ...style })
      return
    }
    if (node.nodeType !== ELEMENT_NODE) return

    const tag = node.tagName?.toLowerCase()
    if (tag === 'br') {
      paragraphs.push(current)
      current = []
      return
    }

    const nextStyle = { ...style }
    if (tag === 'b' || tag === 'strong') nextStyle.bold = true
    if (tag === 'i' || tag === 'em') nextStyle.italic = true
    if (tag === 'span') {
      // deno_dom's wasm build doesn't fully support node.style.color as a
      // live parsed getter the way a browser does — read the raw `style`
      // attribute string directly and pull out the color value ourselves.
      const styleAttr = typeof node.getAttribute === 'function' ? node.getAttribute('style') : null
      const colorMatch = styleAttr ? styleAttr.match(/color\s*:\s*([^;]+)/i) : null
      const parsedColor = parseColor(colorMatch ? colorMatch[1].trim() : null)
      if (parsedColor) nextStyle.color = parsedColor
    }

    const children = node.childNodes ? Array.from(node.childNodes) : []
    children.forEach((child: any) => walk(child, nextStyle))

    if (tag === 'div' || tag === 'p') {
      paragraphs.push(current)
      current = []
    }
  }

  const bodyChildren = doc.body?.childNodes ? Array.from(doc.body.childNodes) : []
  bodyChildren.forEach((n: any) => walk(n, { bold: false, italic: false, color: null }))
  if (current.length) paragraphs.push(current)

  return paragraphs
}

// ── PDF page renderer (ported from src/utils/exportInvoicePDF.js) ───────────
async function drawInvoicePage(doc: any, invoice: any, customer: any, data: any, COMPANY: any, productMap: Map<string, string>, payUrl: string | null) {
  const { items, payments, parentCustomer } = data
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

  const logo = await loadLogoForPdf(COMPANY.logo)
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
  y += 4;   doc.text(COMPANY.city, ml, y)
  y += 4;   doc.text(COMPANY.phone, ml, y)
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

  if (parentCustomer) {
    if (customer?.address) { ry += 4.5; doc.text(customer.address, (ml + cw * 0.42), ry) }
    const propertyCityLine = [customer?.city, customer?.province, customer?.postal_code].filter(Boolean).join(', ')
    if (propertyCityLine) { ry += 4; doc.text(propertyCityLine, (ml + cw * 0.42), ry) }
    ry += 4.5
    doc.text(`c/o ${parentCustomer.name}`, (ml + cw * 0.42), ry)
    if (parentCustomer.address) { ry += 4; doc.text(parentCustomer.address, (ml + cw * 0.42), ry) }
    const parentCityLine = [parentCustomer.city, parentCustomer.province, parentCustomer.postal_code].filter(Boolean).join(', ')
    if (parentCityLine) { ry += 4; doc.text(parentCityLine, (ml + cw * 0.42), ry) }
  } else {
    if (customer?.email)   { ry += 4.5; doc.text(customer.email, (ml + cw * 0.42), ry) }
    if (customer?.phone)   { ry += 4;   doc.text(customer.phone, (ml + cw * 0.42), ry) }
    if (customer?.address) { ry += 4;   doc.text(customer.address, (ml + cw * 0.42), ry) }
    const cityLine = [customer?.city, customer?.province, customer?.postal_code].filter(Boolean).join(', ')
    if (cityLine) { ry += 4; doc.text(cityLine, (ml + cw * 0.42), ry) }
  }

  const col3x = pw - mr
  let dy = headerH + 10
  const dateRows: [string, string][] = [
    ['Issue Date', fmtDate(invoice.date)],
    ['Due Date', invoice.due_date ? fmtDate(invoice.due_date) : 'Net 30'],
    ...(invoice.po_number ? [['PO Number', invoice.po_number] as [string, string]] : []),
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
  y += 8

  const showDiscount = items.some((i: any) => i.discount_value > 0 && i.discount_type !== 'none')

  const cols: any = showDiscount
    ? {
        desc:     { x: ml,               w: cw * 0.38, align: 'left' },
        qty:      { x: ml + cw * 0.38,   w: cw * 0.10, align: 'right' },
        price:    { x: ml + cw * 0.48,   w: cw * 0.17, align: 'right' },
        discount: { x: ml + cw * 0.65,   w: cw * 0.16, align: 'right' },
        amt:      { x: ml + cw * 0.81,   w: cw * 0.19, align: 'right' },
      }
    : {
        desc:  { x: ml,             w: cw * 0.50, align: 'left' },
        qty:   { x: ml + cw * 0.50, w: cw * 0.10, align: 'right' },
        price: { x: ml + cw * 0.60, w: cw * 0.20, align: 'right' },
        amt:   { x: ml + cw * 0.80, w: cw * 0.20, align: 'right' },
      }
  const colRight = (col: any) => col.x + col.w

  const thH = 7
  setColor(doc, C.tealLight, 'fill')
  doc.rect(ml, y, cw, thH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(doc, C.teal)

  const headers: [string, any, string][] = showDiscount
    ? [
        ['DESCRIPTION', cols.desc, 'left'],
        ['QTY', cols.qty, 'right'],
        ['UNIT PRICE', cols.price, 'right'],
        ['DISCOUNT', cols.discount, 'right'],
        ['AMOUNT', cols.amt, 'right'],
      ]
    : [
        ['DESCRIPTION', cols.desc, 'left'],
        ['QTY', cols.qty, 'right'],
        ['UNIT PRICE', cols.price, 'right'],
        ['AMOUNT', cols.amt, 'right'],
      ]

  headers.forEach(([label, col, align]) => {
    const tx = align === 'right' ? colRight(col) - 1 : col.x + 1
    doc.text(label, tx, y + 4.8, { align })
  })

  y += thH

  const rowH = 8
  items.forEach((item: any, i: number) => {
    const lineSubtotal = calcLineSubtotal(item)
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

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ml, y, pw - mr, y)
  y += 8

  const subtotal = items.reduce((s: number, i: any) => s + calcLineTotal(i), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

  const totalPaid  = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  const balanceDue = total - totalPaid
  const fullyPaid  = totalPaid > 0 && balanceDue <= 0.005

  const totRows: [string, string, boolean, boolean][] = [
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

  // ── Pay Now button — directly under the totals block, right-aligned to
  // the same value column as Total Due / Balance Due. Replaces the old
  // full-width box with printed URL that used to sit after Notes.
  y = drawPayButton(doc, y + 2, valueX, ph, payUrl)

  if (payments.length > 0) {
    y += 6
    if (y + 10 > ph - 40) { doc.addPage(); y = 20 }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.teal)
    doc.text('PAYMENTS RECEIVED', ml, y)
    y += 5

    const METHOD_LABELS: Record<string, string> = {
      card: 'Card', cash: 'Cash', cheque: 'Cheque', etransfer: 'e-Transfer', other: 'Other',
    }

    payments.forEach((p: any) => {
      if (y + 6 > ph - 30) { doc.addPage(); y = 20 }
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

  // NOTE: invoice.notes is expected to already be sanitized HTML from
  // RichTextNotes.jsx at save time. Share sanitizeNotesHtml.js if you'd
  // like an extra sanitize pass added here too.
  if (invoice.notes && invoice.notes.trim() !== '') {
    y += 6
    if (y + 10 > ph - 30) { doc.addPage(); y = 20 }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.teal)
    doc.text('NOTES', ml, y)
    y += 4

    const maxWidth = pw - ml - mr
    const lineHeight = 4.2
    const paragraphs = parseNotesHtml(invoice.notes)

    paragraphs.forEach((runs) => {
      if (y + lineHeight > ph - 20) { doc.addPage(); y = 20 }
      if (runs.length === 0) { y += lineHeight; return }

      let x = ml
      runs.forEach((run: any) => {
        const style = run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : run.italic ? 'italic' : 'normal'
        doc.setFont('helvetica', style)
        doc.setFontSize(8.5)
        setColor(doc, run.color || C.muted)

        const tokens = run.text.split(/(\s+)/).filter((t: string) => t !== '')
        tokens.forEach((token: string) => {
          const w = doc.getTextWidth(token)
          if (/^\s+$/.test(token)) { x += w; return }
          if (x + w > ml + maxWidth) {
            x = ml
            y += lineHeight
            if (y + lineHeight > ph - 20) { doc.addPage(); y = 20 }
          }
          doc.text(token, x, y)
          x += w
        })
      })

      y += lineHeight
    })
  }

  const footerY = ph - 16
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(ml, footerY, pw - mr, footerY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  setColor(doc, C.light)
  doc.text('Thank you for your business.', pw / 2, footerY + 5, { align: 'center' })
  doc.text(COMPANY.name + '  ·  ' + COMPANY.phone, pw / 2, footerY + 9.5, { align: 'center' })
}

// ── Data fetching (service-role, bypasses RLS) ───────────────────────────────
async function fetchInvoiceFull(admin: any, invoiceId: string, orgId: string) {
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('*, customers(*)')
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .single()
  if (invErr || !invoice) throw new Error(invErr?.message || 'Invoice not found')

  const customer = invoice.customers

  const { data: orgRow } = await admin
    .from('organization_settings')
    .select('company_name, company_address, company_city, company_phone, gst_number, company_logo_url')
    .eq('org_id', orgId)
    .single()

  const COMPANY = {
    name:    orgRow?.company_name    || '',
    address: orgRow?.company_address || '',
    city:    orgRow?.company_city    || '',
    phone:   orgRow?.company_phone   || '',
    gst:     orgRow?.gst_number      || '',
    logo:    orgRow?.company_logo_url || '',
  }

  const { data: productList } = await admin
    .from('products')
    .select('id, name')
    .eq('org_id', orgId)
  const productMap = new Map((productList || []).map((p: any) => [p.id, p.name]))

  const { data: items } = await admin
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('org_id', orgId)

  const { data: payments } = await admin
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('org_id', orgId)
    .order('payment_date', { ascending: true })

  let parentCustomer = null
  if (customer?.parent_customer_id) {
    const { data: parentRow } = await admin
      .from('customers')
      .select('name, address, city, province, postal_code')
      .eq('id', customer.parent_customer_id)
      .single()
    parentCustomer = parentRow || null
  }

  return {
    invoice, customer, COMPANY, productMap,
    items: items || [], payments: payments || [], parentCustomer,
  }
}

function buildEmailHtml(invoice: any, customer: any, COMPANY: any, sendNote: string, total: number, payUrl: string | null) {
  return `
    <div style="margin:0;padding:0;background:#f1f5f9;">
      <div style="max-width:640px;margin:0 auto;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
        <div style="background:#1e293b;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">
            ${COMPANY.name || 'Invoice'}
          </div>
          <div style="font-size:28px;line-height:1.2;font-weight:700;color:#ffffff;margin:0;">
            Invoice ${invoice.number}
          </div>
          <div style="font-size:14px;color:#cbd5e1;margin-top:8px;">
            ${fmt(total)} due${invoice.due_date ? ` on ${fmtDate(invoice.due_date)}` : ''}
          </div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:32px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi ${customer?.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 24px;">
            Please find your invoice attached. A summary is included below for quick reference.
          </p>
          <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 24px;">
            <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
              <span style="font-size:13px;color:#64748b;">Invoice</span>
              <span style="font-size:13px;font-weight:600;color:#1e293b;">${invoice.number}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #e2e8f0;">
              <span style="font-size:13px;color:#64748b;">Amount Due</span>
              <span style="font-size:16px;font-weight:700;color:#0d7377;">${fmt(total)}</span>
            </div>
            ${invoice.due_date ? `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;">
              <span style="font-size:13px;color:#64748b;">Due Date</span>
              <span style="font-size:13px;font-weight:600;color:#1e293b;">${fmtDate(invoice.due_date)}</span>
            </div>` : ''}
          </div>
          ${invoice.notes && invoice.notes.trim() !== '' ? `
          <div style="background:#f8fafc;border-left:4px solid #94a3b8;border-radius:10px;padding:16px 18px;margin:0 0 24px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Invoice notes</div>
            <div style="font-size:14px;line-height:1.7;color:#334155;">${invoice.notes}</div>
          </div>` : ''}
          ${sendNote ? `
          <div style="background:#f8fafc;border-left:4px solid #0d7377;border-radius:10px;padding:16px 18px;margin:0 0 24px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Personal note</div>
            <div style="font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${sendNote}</div>
          </div>` : ''}
          ${payUrl ? `
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${payUrl}" style="display:inline-block;background:#0d7377;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;">
              Pay Now — ${fmt(total)}
            </a>
          </div>
          <p style="text-align:center;font-size:12px;color:#94a3b8;margin:0 0 24px;word-break:break-all;">
            Or copy this link: <a href="${payUrl}" style="color:#0d7377;">${payUrl}</a>
          </p>
          ` : `
          <div style="text-align:center;margin:28px 0 24px;">
            <a href="mailto:info@klair.ca" style="display:inline-block;background:#0d7377;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">
              Contact us
            </a>
          </div>
          `}
          <p style="font-size:13px;line-height:1.7;color:#64748b;margin:0;">
            If you have any questions, please reply to this email and we'll be happy to help.
          </p>
          <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8;">
            <div style="font-weight:600;color:#475569;margin-bottom:4px;">${COMPANY.name || 'Your Company'}</div>
            ${COMPANY.phone ? `<div>${COMPANY.phone}</div>` : ''}
            ${COMPANY.address ? `<div>${COMPANY.address}${COMPANY.city ? ', ' + COMPANY.city : ''}</div>` : ''}
            ${COMPANY.gst ? `<div style="margin-top:6px;">GST: ${COMPANY.gst}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    // deno-lint-ignore prefer-const
    let { to, subject, html, pdfBase64, filename, companyName, orgId } = body

    let markSentInvoiceId: string | null = null

    // ── LEAN path: server generates the PDF + HTML itself ──────────────────
    if (body.invoiceId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const {
        invoice, customer, COMPANY, productMap, items, payments, parentCustomer,
      } = await fetchInvoiceFull(supabaseAdmin, body.invoiceId, body.orgId)

      const subtotal = items.reduce((s: number, i: any) => s + calcLineTotal(i), 0)
      const tax      = subtotal * 0.05
      const total    = subtotal + tax

      // Computed from the invoice row itself — see computePayUrl's comment
      // for why any includePayNow/payUrl fields in the request body are
      // deliberately ignored here.
      const payUrl = computePayUrl(invoice)

      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      await drawInvoicePage(doc, invoice, customer, { items, payments, parentCustomer }, COMPANY, productMap, payUrl)
      const pdfBytes = doc.output('arraybuffer') as ArrayBuffer
      pdfBase64 = base64Encode(new Uint8Array(pdfBytes))
      filename  = `${invoice.number || 'invoice'}-${(customer?.name || 'invoice').replace(/\s+/g, '-')}.pdf`

      to           = body.to
      subject      = body.subject || `Invoice ${invoice.number} from ${COMPANY.name || body.companyName || DEFAULT_SENDER_NAME}`
      html         = buildEmailHtml(invoice, customer, COMPANY, body.sendNote || '', total, payUrl)
      companyName  = COMPANY.name || body.companyName
      orgId        = body.orgId

      if (invoice.status === 'draft') {
        markSentInvoiceId = body.invoiceId
      }
    }

    // Resolve plan tier — unchanged from before.
    let isFreeTier = true
    let planName = null
    if (orgId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: subscription, error: subErr } = await supabaseAdmin
        .from('org_subscriptions')
        .select('plan:plan_id(name)')
        .eq('org_id', orgId)
        .single()

      if (subErr) {
        console.log('send-invoice: plan lookup error (defaulting to free tier)', subErr.message)
      }
      planName = subscription?.plan?.name || null
      isFreeTier = !planName || planName.toLowerCase() === 'free'
    }

    const senderName  = (!isFreeTier && companyName?.trim()) ? companyName.trim() : DEFAULT_SENDER_NAME
    const fromAddress = FROM_EMAIL_OVERRIDE || `Invoice from ${senderName} <${FROM_EMAIL_ADDRESS}>`

    console.log('send-invoice: request received', {
      to, subject, hasPdf: !!pdfBase64, pdfLength: pdfBase64?.length || 0,
      orgId, companyName, planName, isFreeTier, fromAddress,
      leanPath: !!body.invoiceId,
      resendKeyPresent: !!RESEND_API_KEY,
      resendKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.slice(0, 6) : null,
    })

    if (!to || !subject) {
      console.log('send-invoice: missing to/subject, rejecting')
      return new Response(JSON.stringify({ error: 'Missing to or subject' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const attachments = []
    if (pdfBase64 && pdfBase64.length > 100) {
      const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
      attachments.push({ filename: filename || 'invoice.pdf', content: base64Data })
    }

    const payload = {
      from: fromAddress,
      to: [to],
      subject,
      html,
      ...(attachments.length > 0 && { attachments }),
    }

    console.log('send-invoice: calling Resend', {
      from: payload.from, to: payload.to, attachmentCount: attachments.length,
    })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    console.log('send-invoice: Resend responded', { status: res.status, ok: res.ok, data })

    if (!res.ok) {
      console.error('send-invoice: Resend rejected the request', data)
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Lean path only: flip draft → sent server-side now that the email
    // actually went out (mirrors what InvoiceView.jsx used to do client-side).
    if (markSentInvoiceId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      await supabaseAdmin
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', markSentInvoiceId)
        .eq('org_id', orgId)
    }

    console.log('send-invoice: success, Resend id =', data.id)

    return new Response(JSON.stringify({ success: true, id: data.id, markedSent: !!markSentInvoiceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-invoice: unhandled exception', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})