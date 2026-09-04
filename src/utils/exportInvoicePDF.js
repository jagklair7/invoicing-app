// src/utils/exportInvoicePDF.js
// Generates a clean, vector PDF invoice with logo using jsPDF.
// No html2canvas — draws everything as real PDF text/shapes so it's sharp at any zoom.
//
// Install:  npm install jspdf
// Usage:    import { exportInvoicePDF, exportBatchInvoicesPDF } from '../utils/exportInvoicePDF'
//           await exportInvoicePDF(invoice, customer, items, orgId)
//           await exportBatchInvoicesPDF([{ invoice, customer }, ...], orgId, 'Ayre & Oxford')
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

// Parses "rgb(r, g, b)" or "#rrggbb"/"#rgb" into a [r,g,b] array for jsPDF.
// Returns null if the string can't be parsed (falls back to default text color).
function parseColor(str) {
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

// Parses the rich-text Notes HTML (produced by RichTextNotes.jsx) into
// paragraphs of styled runs: [{ text, bold, italic, color }]. Falls back
// gracefully on plain, un-tagged text (older invoices saved before this
// feature existed) — that just becomes a single unstyled run.
function parseNotesHtml(html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html')
  const paragraphs = []
  let current = []

  function walk(node, style) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) current.push({ text: node.textContent, ...style })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const tag = node.tagName.toLowerCase()
    if (tag === 'br') {
      paragraphs.push(current)
      current = []
      return
    }

    const nextStyle = { ...style }
    if (tag === 'b' || tag === 'strong') nextStyle.bold = true
    if (tag === 'i' || tag === 'em') nextStyle.italic = true
    if (tag === 'span' && node.style && node.style.color) {
      const parsedColor = parseColor(node.style.color)
      if (parsedColor) nextStyle.color = parsedColor
    }

    node.childNodes.forEach(child => walk(child, nextStyle))

    if (tag === 'div' || tag === 'p') {
      paragraphs.push(current)
      current = []
    }
  }

  parsed.body.childNodes.forEach(n => walk(n, { bold: false, italic: false, color: null }))
  if (current.length) paragraphs.push(current)

  return paragraphs
}

// ── Shared data fetches ─────────────────────────────────────────────────────

// Org-level billing info + product name lookup — same for every invoice in
// a given org, so batch export fetches this once instead of per invoice.
async function fetchOrgBillingContext(orgId) {
  const { data: orgRow } = await supabase
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
    logo:    orgRow?.company_logo_url || '/icon.png',
  }

  const { data: productList } = await supabase
    .from('products')
    .select('id, name')
    .eq('org_id', orgId)

  const productMap = new Map((productList || []).map(p => [p.id, p.name]))

  return { COMPANY, productMap }
}

// Per-invoice data: line items, payments, and the management company (if
// this customer is a property billed care-of one).
async function fetchInvoiceRenderData(invoice, customer, items, orgId) {
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

  let parentCustomer = null
  if (customer?.parent_customer_id) {
    const { data: parentRow } = await supabase
      .from('customers')
      .select('name, address, city, province, postal_code')
      .eq('id', customer.parent_customer_id)
      .single()
    parentCustomer = parentRow || null
  }

  return { items, payments, parentCustomer }
}

// ── Page renderer ────────────────────────────────────────────────────────────
// Draws one invoice onto the doc's CURRENT page. Caller is responsible for
// calling doc.addPage() beforehand if this isn't the first page. Does not
// save or return anything — used by both the single and batch exporters.
async function drawInvoicePage(doc, invoice, customer, { items, payments, parentCustomer }, COMPANY, productMap) {
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

  if (parentCustomer) {
    // This customer is a property billed care-of a management company:
    // show the property's own address, then a "c/o {management company}"
    // line with the management company's mailing address — matches the
    // paper invoice format (e.g. "Studio Ed ... / c/o Ayre & Oxford / #501,
    // 4730 Gateway Blvd...").
    if (customer?.address) { ry += 4.5; doc.text(customer.address, (ml + cw * 0.42), ry) }

    const propertyCityLine = [
      customer?.city,
      customer?.province,
      customer?.postal_code
    ].filter(Boolean).join(', ')
    if (propertyCityLine) { ry += 4; doc.text(propertyCityLine, (ml + cw * 0.42), ry) }

    ry += 4.5
    doc.text(`c/o ${parentCustomer.name}`, (ml + cw * 0.42), ry)

    if (parentCustomer.address) { ry += 4; doc.text(parentCustomer.address, (ml + cw * 0.42), ry) }

    const parentCityLine = [
      parentCustomer.city,
      parentCustomer.province,
      parentCustomer.postal_code
    ].filter(Boolean).join(', ')
    if (parentCityLine) { ry += 4; doc.text(parentCityLine, (ml + cw * 0.42), ry) }
  } else {
    // Unchanged from before — no management company on this customer.
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
  // Notes are stored as sanitized HTML (bold/italic/color spans only — see
  // RichTextNotes.jsx). We can't hand HTML to jsPDF directly, so we parse it
  // into styled runs and manually word-wrap, switching font style/color per
  // word as needed. Plain, un-tagged text (older invoices) renders exactly
  // as it did before.
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

    const maxWidth = pw - ml - mr
    const lineHeight = 4.2
    const paragraphs = parseNotesHtml(invoice.notes)

    paragraphs.forEach((runs) => {
      if (y + lineHeight > ph - 20) {
        doc.addPage()
        y = 20
      }

      if (runs.length === 0) {
        // Blank line (user pressed Enter on an empty line)
        y += lineHeight
        return
      }

      let x = ml
      runs.forEach((run) => {
        const style = run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : run.italic ? 'italic' : 'normal'
        doc.setFont('helvetica', style)
        doc.setFontSize(8.5)
        setColor(doc, run.color || C.muted)

        // Split into tokens, keeping whitespace as its own token so word
        // boundaries and spacing survive the wrap.
        const tokens = run.text.split(/(\s+)/).filter(t => t !== '')
        tokens.forEach((token) => {
          const w = doc.getTextWidth(token)
          if (/^\s+$/.test(token)) {
            x += w
            return
          }
          if (x + w > ml + maxWidth) {
            x = ml
            y += lineHeight
            if (y + lineHeight > ph - 20) {
              doc.addPage()
              y = 20
            }
          }
          doc.text(token, x, y)
          x += w
        })
      })

      y += lineHeight
    })
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
}

// ── Public exports ───────────────────────────────────────────────────────────

// Single-invoice export — unchanged behavior/signature from before.
export async function exportInvoicePDF(invoice, customer, items = [], orgId) {
  const { COMPANY, productMap } = await fetchOrgBillingContext(orgId)
  const data = await fetchInvoiceRenderData(invoice, customer, items, orgId)

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  await drawInvoicePage(doc, invoice, customer, data, COMPANY, productMap)

  const filename = `${invoice.number || 'invoice'}-${customer?.name?.replace(/\s+/g, '-') || 'invoice'}.pdf`
  doc.save(filename)
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}

// Batch export — one combined PDF with every selected invoice as its own
// page(s), in the order given. `entries` is [{ invoice, customer, items? }].
// Use this for "export all of Ayre & Oxford's property invoices as one file".
export async function exportBatchInvoicesPDF(entries, orgId, batchLabel = 'Invoices') {
  if (!entries || entries.length === 0) return null

  const { COMPANY, productMap } = await fetchOrgBillingContext(orgId)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  for (let i = 0; i < entries.length; i++) {
    const { invoice, customer, items = [] } = entries[i]
    if (i > 0) doc.addPage()
    const data = await fetchInvoiceRenderData(invoice, customer, items, orgId)
    await drawInvoicePage(doc, invoice, customer, data, COMPANY, productMap)
  }

  const safeLabel = (batchLabel || 'Invoices').replace(/[^\w-]+/g, '-')
  const filename = `${safeLabel}-Invoices-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
  const pdfBase64 = doc.output('datauristring')
  return { pdfBase64, filename }
}
