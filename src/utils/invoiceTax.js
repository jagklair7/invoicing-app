// src/utils/invoiceTax.js
//
// Single source of truth for invoice tax on the client.
// MIRRORED by hand in supabase/functions/send-invoice/index.ts and
// api/cron/generate-recurring-invoices.js (they can't import this file).
// Change all three together.
//
// Invoices store their own snapshot (tax_name / tax_pct / tax2_name / tax2_pct).
// A NULL tax_pct means the invoice predates tax settings: legacy 5% GST,
// unrounded, labelled "Tax (5%)" — exactly what the app did before.

export const TAX_PRESETS = [
  { key: 'GST',  label: 'GST 5% — AB, YT, NT, NU',      name: 'GST', pct: 5,  name2: null,  pct2: 0 },
  { key: 'BC',   label: 'BC — GST 5% + PST 7%',         name: 'GST', pct: 5,  name2: 'PST', pct2: 7 },
  { key: 'SK',   label: 'SK — GST 5% + PST 6%',         name: 'GST', pct: 5,  name2: 'PST', pct2: 6 },
  { key: 'MB',   label: 'MB — GST 5% + RST 7%',         name: 'GST', pct: 5,  name2: 'RST', pct2: 7 },
  { key: 'QC',   label: 'QC — GST 5% + QST 9.975%',     name: 'GST', pct: 5,  name2: 'QST', pct2: 9.975 },
  { key: 'ON',   label: 'ON — HST 13%',                 name: 'HST', pct: 13, name2: null,  pct2: 0 },
  { key: 'NS',   label: 'NS — HST 14%',                 name: 'HST', pct: 14, name2: null,  pct2: 0 },
  { key: 'ATL',  label: 'NB, NL, PE — HST 15%',         name: 'HST', pct: 15, name2: null,  pct2: 0 },
  { key: 'NONE', label: 'No tax (exempt / zero-rated)', name: 'Tax', pct: 0,  name2: null,  pct2: 0 },
]

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const fmtPct = (p) => String(Number(p))
const toCfg = (p) => ({ name: p.name, pct: p.pct, name2: p.name2 || null, pct2: p.pct2 || 0 })

export const DEFAULT_TAX = toCfg(TAX_PRESETS[0])

// Config for a NEW invoice, from organization_settings (or GST 5% if unset).
export function taxConfigFromSettings(s) {
  if (!s || s.tax_pct == null) return { ...DEFAULT_TAX }
  return {
    name: s.tax_name || 'GST',
    pct: Number(s.tax_pct) || 0,
    name2: s.tax2_name || null,
    pct2: Number(s.tax2_pct) || 0,
  }
}

// Config saved on an EXISTING invoice. null = legacy invoice.
export function taxConfigFromInvoice(invoice) {
  if (!invoice || invoice.tax_pct == null) return null
  return {
    name: invoice.tax_name || 'Tax',
    pct: Number(invoice.tax_pct) || 0,
    name2: invoice.tax2_name || null,
    pct2: Number(invoice.tax2_pct) || 0,
  }
}

// Columns to write onto an invoice row.
export function taxColumns(cfg) {
  return {
    tax_name: cfg.name,
    tax_pct: cfg.pct,
    tax2_name: cfg.name2 || null,
    tax2_pct: cfg.pct2 || 0,
  }
}

export function describeTax(cfg) {
  if (!cfg) return 'GST 5%'
  const first = `${cfg.name} ${fmtPct(cfg.pct)}%`
  return cfg.name2 && cfg.pct2 > 0 ? `${first} + ${cfg.name2} ${fmtPct(cfg.pct2)}%` : first
}

// Which preset (if any) matches this config.
export function findPresetKey(cfg) {
  const hit = TAX_PRESETS.find(p =>
    p.name === cfg.name && p.pct === cfg.pct &&
    (p.name2 || null) === (cfg.name2 || null) && (p.pct2 || 0) === (cfg.pct2 || 0)
  )
  return hit ? hit.key : null
}

// Returns { lines: [{ label, amount }], tax, total }.
// cfg === null means a legacy invoice.
export function calcInvoiceTax(subtotal, cfg) {
  if (!cfg) {
    const tax = subtotal * 0.05
    return { lines: [{ label: 'Tax (5%)', amount: tax }], tax, total: subtotal + tax }
  }
  const sub = round2(subtotal)
  const t1 = round2(sub * cfg.pct / 100)
  const lines = [{ label: `${cfg.name} (${fmtPct(cfg.pct)}%)`, amount: t1 }]
  let tax = t1
  if (cfg.name2 && cfg.pct2 > 0) {
    const t2 = round2(sub * cfg.pct2 / 100)
    lines.push({ label: `${cfg.name2} (${fmtPct(cfg.pct2)}%)`, amount: t2 })
    tax += t2
  }
  tax = round2(tax)
  return { lines, tax, total: round2(sub + tax) }
}