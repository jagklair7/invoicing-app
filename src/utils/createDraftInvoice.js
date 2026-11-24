// src/utils/createDraftInvoice.js
// Creates one DRAFT invoice with line items, the same way InvoiceForm.jsx does:
// plan-limit check, org-scoped number from organization_settings.invoice_prefix,
// org default tax via invoiceTax utils, notes from the customer's template.
import { supabase } from '../app/supabaseClient'
import { checkCanCreateInvoice } from './planLimits'
import { resolveDefaultNotes, textTemplateToHtml } from './notesTemplate'
import { calcInvoiceTax, taxColumns, taxConfigFromSettings } from './invoiceTax'

// Same default as InvoiceForm.jsx (Net 30).
const DEFAULT_TERMS_DAYS = 30

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * @param {object} p
 * @param {string} p.orgId
 * @param {string} p.customerId
 * @param {Array}  p.customers  rows with { id, name, parent_customer_id, default_notes }
 * @param {Array}  p.lines      [{ name, quantity, unit_price }]
 * @returns the inserted invoice row
 */
export async function createDraftInvoice({ orgId, customerId, customers, lines }) {
  const { allowed, reason } = await checkCanCreateInvoice(orgId)
  if (!allowed) throw new Error(reason)

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('invoice_prefix, tax_name, tax_pct, tax2_name, tax2_pct')
    .eq('org_id', orgId)
    .maybeSingle()
  const taxCfg = taxConfigFromSettings(settings)
  const prefix = settings?.invoice_prefix ?? 'INV-'

  const { data: last } = await supabase
    .from('invoices').select('number').eq('org_id', orgId)
    .order('created_at', { ascending: false }).limit(1)
  const lastNum = last?.[0]?.number ? parseInt(last[0].number.replace(/\D/g, '')) || 0 : 0
  const number = `${prefix}${String(lastNum + 1).padStart(3, '0')}`

  const customer = customers.find(c => c.id === customerId)
  const template = customer ? resolveDefaultNotes(customer, customers) : ''

  const items = lines.map(l => ({
    name: l.name,
    quantity: Math.round(Number(l.quantity) * 100) / 100,
    unit_price: Number(l.unit_price) || 0,
  }))
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const taxCalc = calcInvoiceTax(subtotal, taxCfg)
  const today = new Date().toISOString().split('T')[0]

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .insert([{
      customer_id: customerId,
      number,
      date: today,
      due_date: addDays(today, DEFAULT_TERMS_DAYS),
      status: 'draft',
      notes: template ? textTemplateToHtml(template) : '',
      po_number: null,
      online_payment_enabled: false,
      org_id: orgId,
      subtotal, tax: taxCalc.tax, total: taxCalc.total,
      ...taxColumns(taxCfg),
    }])
    .select()
    .single()
  if (invErr) throw invErr

  const { error: itemErr } = await supabase
    .from('invoice_items')
    .insert(items.map(i => ({
      invoice_id: inv.id,
      org_id: orgId,
      product_id: null,
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
    })))
  if (itemErr) throw itemErr

  return inv
}
