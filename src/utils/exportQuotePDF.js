import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * exportQuotePDF(quote, customer, org)
 * Generates a multi-option quote PDF using jsPDF + autoTable.
 */
export function exportQuotePDF(quote, customer, org) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;

  // ── Colours ──────────────────────────────────────────────────────────────
  const PRIMARY = [79, 70, 229];   // indigo-600
  const DARK    = [17, 24, 39];    // gray-900
  const MID     = [107, 114, 128]; // gray-500
  const LIGHT   = [243, 244, 246]; // gray-100
  const WHITE   = [255, 255, 255];

  let y = margin;

  // ── Header bar ───────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 26, "F");

  // Org name
  doc.setTextColor(...WHITE);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(org?.name || "Your Company", margin, 11);

  if (org?.email || org?.phone) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text([org?.email, org?.phone].filter(Boolean).join("  ·  "), margin, 17);
  }

  // Quote number — right side
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(quote.quote_number, pageW - margin, 11, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("QUOTE", pageW - margin, 17, { align: "right" });

  y = 34;

  // ── Bill To / Meta ────────────────────────────────────────────────────────
  const metaLeft = margin;
  const metaRight = pageW / 2 + 10;

  doc.setTextColor(...DARK);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("PREPARED FOR", metaLeft, y);
  doc.text("DETAILS", metaRight, y);

  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  if (customer?.name) doc.text(customer.name, metaLeft, y);
  if (customer?.email) { y += 5; doc.setFontSize(9); doc.setTextColor(...MID); doc.text(customer.email, metaLeft, y); doc.setTextColor(...DARK); doc.setFontSize(10); }

  // Meta pairs on right
  const pairs = [
    ["Issue Date", quote.issue_date],
    ["Expiry Date", quote.expiry_date || "—"],
    ["PO Number", quote.po_number || "—"],
    quote.selected_option ? ["Selected Option", `Option ${quote.selected_option}`] : null,
  ].filter(Boolean);

  let metaY = y - (customer?.email ? 5 : 0);
  doc.setFontSize(9);
  for (const [label, val] of pairs) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MID);
    doc.text(label + ":", metaRight, metaY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(val, metaRight + 34, metaY);
    metaY += 5;
  }

  y = Math.max(y, metaY) + 10;

  // ── Options ───────────────────────────────────────────────────────────────
  for (const opt of quote.options || []) {
    // Option label pill
    doc.setFillColor(...LIGHT);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");

    doc.setFillColor(...PRIMARY);
    doc.roundedRect(margin + 2, y + 1.5, 14, 7, 1.5, 1.5, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(opt.label, margin + 9, y + 6.5, { align: "center" });

    doc.setTextColor(...DARK);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const optTitle = opt.title ? `Option ${opt.label} — ${opt.title}` : `Option ${opt.label}`;
    doc.text(optTitle, margin + 20, y + 6.5);

    // Total on right of header
    doc.setFontSize(11);
    doc.text(`$${(opt.total || 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, pageW - margin, y + 6.5, { align: "right" });

    y += 13;

    // Description
    if (opt.description) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...MID);
      doc.text(opt.description, margin, y);
      y += 6;
    }

    // Line items table
    const tableRows = (opt.line_items || []).map((item) => {
      const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
      let disc = 0;
      if (item.discount_type === "%") disc = lineTotal * ((parseFloat(item.discount) || 0) / 100);
      else disc = parseFloat(item.discount) || 0;
      const net = lineTotal - disc;
      return [
        item.description || "",
        String(item.quantity || 1),
        `$${parseFloat(item.unit_price || 0).toFixed(2)}`,
        disc > 0 ? `−$${disc.toFixed(2)}` : "—",
        `$${net.toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Description", "Qty", "Unit Price", "Discount", "Total"]],
      body: tableRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 3, textColor: DARK },
      headStyles: {
        fillColor: PRIMARY, textColor: WHITE, fontStyle: "bold", fontSize: 8,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right", cellWidth: 16 },
        2: { halign: "right", cellWidth: 26 },
        3: { halign: "right", cellWidth: 24 },
        4: { halign: "right", cellWidth: 28, fontStyle: "bold" },
      },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 4;

    // Totals block
    const totalsX = pageW - margin - 70;
    const valX = pageW - margin;

    const totalsRows = [
      ["Subtotal", `$${(opt.subtotal || 0).toFixed(2)}`],
      opt.discount_total > 0 ? ["Discount", `−$${opt.discount_total.toFixed(2)}`] : null,
      opt.tax > 0 ? ["Tax", `$${opt.tax.toFixed(2)}`] : null,
    ].filter(Boolean);

    doc.setFontSize(9);
    for (const [label, val] of totalsRows) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MID);
      doc.text(label, totalsX, y);
      doc.setTextColor(...DARK);
      doc.text(val, valX, y, { align: "right" });
      y += 5;
    }

    // Total line
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.5);
    doc.line(totalsX, y, valX, y);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PRIMARY);
    doc.text("Total", totalsX, y);
    doc.text(`$${(opt.total || 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, valX, y, { align: "right" });

    y += 14;

    // Page break check
    if (y > 240 && quote.options.indexOf(opt) < quote.options.length - 1) {
      doc.addPage();
      y = margin;
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (quote.notes) {
    doc.setFillColor(...LIGHT);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MID);
    doc.text("NOTES", margin + 3, y + 5);
    y += 11;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const splitNotes = doc.splitTextToSize(quote.notes, contentW);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 5 + 6;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, pageH - 14, pageW, 14, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${org?.name || ""} · Thank you for your business`,
    pageW / 2, pageH - 5.5, { align: "center" }
  );

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`${quote.quote_number}.pdf`);
}
