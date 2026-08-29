import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../app/supabaseClient'


/**
 * exportQuotePDF(quote, customer, org)
 *
 * Generates a professionally branded multi-option quote PDF.
 *
 * Visual style matches exportInvoicePDF.js:
 * - Same teal/slate colour palette
 * - Same company logo
 * - Same typography
 * - Same spacing and borders
 * - Same organization_settings branding
 */


// ─────────────────────────────────────────────────────────────────────────────
// BRAND COLOURS
// Matches exportInvoicePDF.js
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  teal:      [13, 115, 119],     // #0D7377
  tealLight: [232, 245, 245],    // #E8F5F5
  text:      [30, 41, 59],       // #1E293B
  muted:     [100, 116, 139],     // #64748B
  light:     [148, 163, 184],     // #94A3B8
  border:    [226, 232, 240],     // #E2E8F0
  white:     [255, 255, 255],
  green:     [5, 150, 105],       // #059669
  rowAlt:    [248, 250, 252],
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number(n) || 0)


const fmtDate = (d) =>
  d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'


function setColor(doc, rgb, type = 'text') {
  const safe = Array.isArray(rgb) ? rgb : [0, 0, 0]

  if (type === 'fill') {
    doc.setFillColor(...safe)
  } else {
    doc.setTextColor(...safe)
  }
}


/**
 * Loads a logo and converts it to a PNG data URL.
 *
 * This follows the same approach as exportInvoicePDF.js.
 */
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }

    const img = new Image()

    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')

        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        const ctx = canvas.getContext('2d')

        if (!ctx) {
          resolve(null)
          return
        }

        ctx.drawImage(img, 0, 0)

        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          w: img.naturalWidth,
          h: img.naturalHeight,
        })
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => resolve(null)

    img.src = src
  })
}


/**
 * Draw a wrapped paragraph and return the new Y position.
 */
function drawWrappedText(
  doc,
  text,
  x,
  y,
  maxWidth,
  lineHeight = 4.5
) {
  if (!text) return y

  const lines = doc.splitTextToSize(String(text), maxWidth)

  doc.text(lines, x, y)

  return y + lines.length * lineHeight
}


/**
 * Draw footer on every page.
 */
function drawFooter(doc, companyName, phone) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const ml = 18
  const mr = 18

  const footerY = pageH - 16

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)

  doc.line(
    ml,
    footerY,
    pageW - mr,
    footerY
  )

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)

  setColor(doc, C.light)

  doc.text(
    'Thank you for considering our proposal.',
    pageW / 2,
    footerY + 5,
    { align: 'center' }
  )

  doc.setFont('helvetica', 'normal')

  doc.text(
    `${companyName || ''}${phone ? `  ·  ${phone}` : ''}`,
    pageW / 2,
    footerY + 9.5,
    { align: 'center' }
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function exportQuotePDF(quote, customer, org) {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Load company settings
  // ───────────────────────────────────────────────────────────────────────────

  let orgRow = null

  // Prefer org.id when available.
  // Fall back to org.org_id if that's how your OrgContext stores it.
  const orgId = org?.id || org?.org_id

  if (orgId) {
    const { data } = await supabase
      .from('organization_settings')
      .select(`
        company_name,
        company_address,
        company_city,
        company_phone,
        gst_number,
        company_logo_url
      `)
      .eq('org_id', orgId)
      .single()

    orgRow = data || null
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 2. Company information
  // ───────────────────────────────────────────────────────────────────────────

  const COMPANY = {
  name:    orgRow?.company_name    || org?.name || '',
  address: orgRow?.company_address || '',
  city:    orgRow?.company_city    || '',
  phone:   orgRow?.company_phone   || '',
  email:   orgRow?.company_email   || '',
  gst:     orgRow?.gst_number      || '',
  logo:    orgRow?.company_logo_url || '/icon.png',
  }
  // ───────────────────────────────────────────────────────────────────────────
  // 3. Initialize document
  // ───────────────────────────────────────────────────────────────────────────

  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const margin = 18

  const contentW = pageW - margin * 2

  const footerReserve = 28

  let y = 0


  // ───────────────────────────────────────────────────────────────────────────
  // 4. Load logo
  // ───────────────────────────────────────────────────────────────────────────

  const logo = await loadImage(COMPANY.logo)


  // ───────────────────────────────────────────────────────────────────────────
  // 5. HEADER
  // ───────────────────────────────────────────────────────────────────────────

  const headerH = 38

  // Bottom divider
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.25)

  doc.line(
    margin,
    headerH,
    pageW - margin,
    headerH
  )


  // ── Logo / company ─────────────────────────────────────────────────────────

  if (logo) {

    const maxW = 34
    const maxH = 27

    const ratio = Math.min(
      maxW / logo.w,
      maxH / logo.h
    )

    const logoW = logo.w * ratio
    const logoH = logo.h * ratio

    const logoY = (headerH - logoH) / 2

    doc.addImage(
      logo.dataUrl,
      'PNG',
      margin,
      logoY,
      logoW,
      logoH
    )

  } else {

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)

    setColor(doc, C.text)

    doc.text(
      COMPANY.name,
      margin,
      17
    )
  }


  // ── Company details ─────────────────────────────────────────────────────────

  let companyX = margin

  if (logo) {
    companyX = margin + 40
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)

  setColor(doc, C.text)

  doc.text(
    COMPANY.name,
    companyX,
    15
  )


  const companyDetails = [
    COMPANY.address,
    COMPANY.city,
    COMPANY.phone,
    COMPANY.email,
  ].filter(Boolean)

  if (companyDetails.length > 0) {

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)

    setColor(doc, C.muted)

    let companyY = 20

    companyDetails.forEach((line) => {

      doc.text(
        String(line),
        companyX,
        companyY
      )

      companyY += 3.7
    })
  }


  // ── Quote title ────────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)

  setColor(doc, C.text)

  doc.text(
    'QUOTE',
    pageW - margin,
    15,
    { align: 'right' }
  )


  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  setColor(doc, C.muted)

  doc.text(
    'Quote No.',
    pageW - margin,
    21,
    { align: 'right' }
  )


  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)

  setColor(doc, C.teal)

  doc.text(
    quote?.quote_number || '—',
    pageW - margin,
    27,
    { align: 'right' }
  )


  y = headerH + 10


  // ───────────────────────────────────────────────────────────────────────────
  // 6. PREPARED FOR / DETAILS
  // ───────────────────────────────────────────────────────────────────────────

  const leftX = margin

  const middleX = margin + contentW * 0.42

  const rightX = pageW - margin


  // ── Prepared for ───────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)

  setColor(doc, C.teal)

  doc.text(
    'PREPARED FOR',
    leftX,
    y
  )

  y += 5


  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)

  setColor(doc, C.text)

  doc.text(
    customer?.name || '—',
    leftX,
    y
  )


  if (customer?.email) {

    y += 4.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)

    setColor(doc, C.muted)

    doc.text(
      customer.email,
      leftX,
      y
    )
  }


  if (customer?.phone) {

    y += 4

    doc.text(
      customer.phone,
      leftX,
      y
    )
  }


  if (customer?.address) {

    y += 4

    doc.text(
      customer.address,
      leftX,
      y
    )
  }


  const customerCityLine = [
    customer?.city,
    customer?.province,
    customer?.postal_code,
  ]
    .filter(Boolean)
    .join(', ')


  if (customerCityLine) {

    y += 4

    doc.text(
      customerCityLine,
      leftX,
      y
    )
  }


  // ── Details ────────────────────────────────────────────────────────────────

  let detailY = headerH + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)

  setColor(doc, C.teal)

  doc.text(
    'DETAILS',
    middleX,
    detailY
  )


  detailY += 5


  const detailRows = [
    ['Issue Date', fmtDate(quote?.issue_date)],
    [
      'Expiry Date',
      quote?.expiry_date
        ? fmtDate(quote.expiry_date)
        : '—',
    ],
    [
      'PO Number',
      quote?.po_number || '—',
    ],
    quote?.selected_option
      ? [
          'Selected Option',
          `Option ${quote.selected_option}`,
        ]
      : null,
  ].filter(Boolean)


  detailRows.forEach(([label, value]) => {

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)

    setColor(doc, C.muted)

    doc.text(
      label,
      middleX,
      detailY
    )


    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)

    setColor(doc, C.text)

    doc.text(
      String(value),
      rightX,
      detailY,
      { align: 'right' }
    )


    detailY += 6.5
  })


  y = Math.max(
    y,
    detailY
  ) + 8


  // Divider

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)

  doc.line(
    margin,
    y,
    pageW - margin,
    y
  )

  y += 8


  // ───────────────────────────────────────────────────────────────────────────
  // 7. OPTIONS
  // ───────────────────────────────────────────────────────────────────────────

  const options = Array.isArray(quote?.options)
    ? quote.options
    : []


  options.forEach((opt, optionIndex) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Page space check before option
    // ─────────────────────────────────────────────────────────────────────────

    if (y > pageH - footerReserve - 55) {

      drawFooter(
        doc,
        COMPANY.name,
        COMPANY.phone
      )

      doc.addPage()

      y = 20
    }


    // ─────────────────────────────────────────────────────────────────────────
    // OPTION HEADER
    // ─────────────────────────────────────────────────────────────────────────

    const optionHeaderH = 12


    // Light teal background

    setColor(
      doc,
      C.tealLight,
      'fill'
    )

    doc.roundedRect(
      margin,
      y,
      contentW,
      optionHeaderH,
      2,
      2,
      'F'
    )


    // Option number pill

    setColor(
      doc,
      C.teal,
      'fill'
    )

    doc.roundedRect(
      margin + 2,
      y + 2,
      17,
      8,
      1.5,
      1.5,
      'F'
    )


    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)

    setColor(
      doc,
      C.white
    )


    doc.text(
      `OPTION ${opt?.label || optionIndex + 1}`,
      margin + 10.5,
      y + 7.2,
      { align: 'center' }
    )


    // Option title

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)

    setColor(
      doc,
      C.text
    )


    const title =
      opt?.title
        ? opt.title
        : `Option ${opt?.label || optionIndex + 1}`


    doc.text(
      title,
      margin + 23,
      y + 7.2
    )


    // Option total

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)

    setColor(
      doc,
      C.teal
    )


    doc.text(
      fmt(opt?.total),
      pageW - margin - 2,
      y + 7.2,
      { align: 'right' }
    )


    y += optionHeaderH + 5


    // ─────────────────────────────────────────────────────────────────────────
    // DESCRIPTION
    // ─────────────────────────────────────────────────────────────────────────

    if (opt?.description) {

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8.5)

      setColor(
        doc,
        C.muted
      )


      const descriptionLines =
        doc.splitTextToSize(
          String(opt.description),
          contentW
        )


      doc.text(
        descriptionLines,
        margin,
        y
      )


      y +=
        descriptionLines.length * 4.2 +
        5
    }


    // ─────────────────────────────────────────────────────────────────────────
    // LINE ITEMS
    // ─────────────────────────────────────────────────────────────────────────

    const lineItems = Array.isArray(opt?.line_items)
      ? opt.line_items
      : []


    const tableRows = lineItems.map((item) => {

      const quantity =
        Number(item?.quantity) || 0

      const unitPrice =
        Number(item?.unit_price) || 0

      const lineSubtotal =
        quantity * unitPrice


      let discount = 0


      if (item?.discount_type === '%') {

        discount =
          lineSubtotal *
          ((Number(item?.discount) || 0) / 100)

      } else {

        discount =
          Number(item?.discount) || 0
      }


      const net =
        Math.max(
          0,
          lineSubtotal - discount
        )


      return [
        item?.description || '',
        String(item?.quantity || 1),
        fmt(unitPrice),
        discount > 0
          ? `-${fmt(discount)}`
          : '—',
        fmt(net),
      ]
    })


    autoTable(doc, {

      startY: y,

      head: [
        [
          'DESCRIPTION',
          'QTY',
          'UNIT PRICE',
          'DISCOUNT',
          'AMOUNT',
        ],
      ],

      body: tableRows,

      margin: {
        left: margin,
        right: margin,
      },

      theme: 'plain',

      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: C.text,
        cellPadding: 3,
        lineColor: C.border,
        lineWidth: 0.15,
      },

      headStyles: {
        fillColor: C.teal,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 2.8,
      },

      alternateRowStyles: {
        fillColor: C.rowAlt,
      },

      bodyStyles: {
        lineColor: C.border,
        lineWidth: 0.15,
      },

      columnStyles: {

        0: {
          cellWidth: 'auto',
          halign: 'left',
        },

        1: {
          cellWidth: 15,
          halign: 'right',
        },

        2: {
          cellWidth: 28,
          halign: 'right',
        },

        3: {
          cellWidth: 27,
          halign: 'right',
        },

        4: {
          cellWidth: 30,
          halign: 'right',
          fontStyle: 'bold',
        },
      },

      didParseCell(data) {

        // Discount column

        if (
          data.section === 'body' &&
          data.column.index === 3 &&
          data.cell.raw !== '—'
        ) {

          data.cell.styles.textColor =
            C.green
        }


        // Amount column

        if (
          data.section === 'body' &&
          data.column.index === 4
        ) {

          data.cell.styles.textColor =
            C.text
        }
      },

      didDrawPage() {

        // Keep footer on pages generated automatically
        drawFooter(
          doc,
          COMPANY.name,
          COMPANY.phone
        )
      },
    })


    y =
      doc.lastAutoTable.finalY +
      6


    // ─────────────────────────────────────────────────────────────────────────
    // TOTALS
    // ─────────────────────────────────────────────────────────────────────────

    const subtotal =
      Number(opt?.subtotal) || 0

    const discountTotal =
      Number(opt?.discount_total) || 0

    const tax =
      Number(opt?.tax) || 0

    const total =
      Number(opt?.total) ||
      subtotal -
        discountTotal +
        tax


    const totalsX =
      pageW - margin - 72

    const valueX =
      pageW - margin


    const totalsRows = [
      [
        'Subtotal',
        fmt(subtotal),
      ],

      discountTotal > 0
        ? [
            'Discount',
            `-${fmt(discountTotal)}`,
          ]
        : null,

      tax > 0
        ? [
            'Tax',
            fmt(tax),
          ]
        : null,
    ].filter(Boolean)


    // Ensure totals fit on page

    const estimatedTotalsHeight =
      totalsRows.length * 6 + 20


    if (
      y + estimatedTotalsHeight >
      pageH - footerReserve
    ) {

      drawFooter(
        doc,
        COMPANY.name,
        COMPANY.phone
      )

      doc.addPage()

      y = 20
    }


    // Normal totals

    totalsRows.forEach(([label, value]) => {

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)

      setColor(
        doc,
        C.muted
      )

      doc.text(
        label,
        totalsX,
        y
      )


      doc.setFont('helvetica', 'normal')

      setColor(
        doc,
        C.text
      )

      doc.text(
        value,
        valueX,
        y,
        { align: 'right' }
      )


      y += 6
    })


    // ── Grand total box ──────────────────────────────────────────────────────

    y += 2


    setColor(
      doc,
      C.tealLight,
      'fill'
    )


    doc.roundedRect(
      totalsX - 4,
      y - 5,
      76,
      12,
      1.5,
      1.5,
      'F'
    )


    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)

    setColor(
      doc,
      C.teal
    )

    doc.text(
      'TOTAL',
      totalsX,
      y + 2
    )


    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)

    setColor(
      doc,
      C.teal
    )

    doc.text(
      fmt(total),
      valueX,
      y + 2.5,
      { align: 'right' }
    )


    y += 16


    // ─────────────────────────────────────────────────────────────────────────
    // OPTION SEPARATOR
    // ─────────────────────────────────────────────────────────────────────────

    if (
      optionIndex <
      options.length - 1
    ) {

      doc.setDrawColor(...C.border)
      doc.setLineWidth(0.25)

      doc.line(
        margin,
        y,
        pageW - margin,
        y
      )

      y += 9
    }
  })


  // ───────────────────────────────────────────────────────────────────────────
  // 8. NOTES
  // ───────────────────────────────────────────────────────────────────────────

  if (
    quote?.notes &&
    String(quote.notes).trim() !== ''
  ) {

    if (
      y + 35 >
      pageH - footerReserve
    ) {

      drawFooter(
        doc,
        COMPANY.name,
        COMPANY.phone
      )

      doc.addPage()

      y = 20
    }


    y += 3


    // Notes heading

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)

    setColor(
      doc,
      C.teal
    )

    doc.text(
      'NOTES',
      margin,
      y
    )


    y += 5


    // Notes background

    const noteLines =
      doc.splitTextToSize(
        String(quote.notes),
        contentW - 8
      )


    const noteHeight =
      Math.max(
        14,
        noteLines.length * 4.2 + 8
      )


    setColor(
      doc,
      C.tealLight,
      'fill'
    )


    doc.roundedRect(
      margin,
      y - 3,
      contentW,
      noteHeight,
      2,
      2,
      'F'
    )


    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)

    setColor(
      doc,
      C.text
    )


    doc.text(
      noteLines,
      margin + 4,
      y + 3
    )


    y += noteHeight + 5
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 9. FINAL FOOTER
  // ───────────────────────────────────────────────────────────────────────────

  drawFooter(
    doc,
    COMPANY.name,
    COMPANY.phone
  )


  // ───────────────────────────────────────────────────────────────────────────
  // 10. SAVE
  // ───────────────────────────────────────────────────────────────────────────

  const filename =
    `${quote?.quote_number || 'quote'}.pdf`


  doc.save(filename)
}