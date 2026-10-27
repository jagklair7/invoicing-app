// src/utils/invoiceAdjustment.js
//
// Helpers for invoices.adjusted_total — a tax-INCLUSIVE negotiated total that
// replaces the calculated total when present. invoices.total is never
// overwritten, so the original amount stays on record.
//
// MIRRORED by hand in supabase/functions/send-invoice/index.ts (the Edge
// Function can't import browser files) — keep the two in sync.

import { taxConfigFromInvoice } from './invoiceTax'

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// The stored adjusted total as a number, or null when there is none.
export function getAdjustedTotal(invoice) {
  const a = invoice?.adjusted_total
  if (a === null || a === undefined || a === '') return null
  const n = Number(a)
  return Number.isFinite(n) ? round2(n) : null
}

// True only when an adjusted total exists AND differs from the calculated total.
export function hasAdjustment(invoice, calculatedTotal) {
  const a = getAdjustedTotal(invoice)
  return a !== null && Math.abs(a - Number(calculatedTotal || 0)) > 0.005
}

// What the customer actually owes: adjusted total if present, else calculated.
export function getEffectiveTotal(invoice, calculatedTotal) {
  return hasAdjustment(invoice, calculatedTotal)
    ? getAdjustedTotal(invoice)
    : calculatedTotal
}

// Back out the tax included in a tax-inclusive adjusted total, using the
// invoice's own tax config (legacy invoices with no tax_pct = 5% GST).
// Returns { subtotal, tax, lines: [{ label, amount }] }; lines sum to tax.
export function adjustedTaxBreakdown(adjustedTotal, invoice) {
  const cfg = taxConfigFromInvoice(invoice)
  const rates = cfg
    ? [{ label: `${cfg.name} (${Number(cfg.pct)}%)`, pct: Number(cfg.pct) || 0 }]
    : [{ label: 'Tax (5%)', pct: 5 }]
  if (cfg && cfg.name2 && Number(cfg.pct2) > 0) {
    rates.push({ label: `${cfg.name2} (${Number(cfg.pct2)}%)`, pct: Number(cfg.pct2) })
  }

  const totalPct = rates.reduce((s, r) => s + r.pct, 0)
  const total = round2(adjustedTotal)
  const tax = totalPct > 0 ? round2(total * totalPct / (100 + totalPct)) : 0

  const lines = rates.map(r => ({
    label: r.label,
    amount: totalPct > 0 ? round2(total * r.pct / (100 + totalPct)) : 0,
  }))
  // Put any rounding remainder on the last line so lines always sum to tax.
  const diff = round2(tax - lines.reduce((s, l) => s + l.amount, 0))
  if (lines.length && diff !== 0) lines[lines.length - 1].amount = round2(lines[lines.length - 1].amount + diff)

  return { subtotal: round2(total - tax), tax, lines }
}