// api/cron/generate-recurring-invoices.js
//
// Vercel Cron endpoint — schedule daily, e.g. "0 12 * * *" (12:00 UTC).
// Add the corresponding entry to vercel.json (see vercel-cron-snippet.json).
//
// Corrected against your actual InvoiceForm.jsx / schema:
//   - invoices columns are { customer_id, number, date, due_date, status,
//     notes, subtotal, tax, total, org_id, online_payment_enabled },
//     NOT { invoice_number, line_items }.
//   - Line items go in a separate invoice_items table
//     { invoice_id, org_id, product_id, name, quantity, unit_price },
//     same as the insert in InvoiceForm.jsx's handleSubmit.
//   - Invoice numbering mirrors suggestInvoiceNumber() in InvoiceForm.jsx:
//     read organization_settings.invoice_prefix (falling back to 'INV-'),
//     look at the most recent invoice number for the org, increment it.
//     A template's own invoice_number_prefix (if set) overrides the org default.
//   - Tax is hardcoded at 5% in InvoiceForm.jsx, so this matches that —
//     flag if tax should vary by customer/org in some cases you know of
//     that aren't visible in this file.
//   - Does NOT auto-charge the customer's card (confirmed out of scope).
//     It only generates and sends the invoice; the customer pays manually
//     via Pay Now if online_payment_enabled is set on the template.
//   - Invoice is inserted as 'draft', then send-invoice is invoked (same
//     call handleSendInvoice() makes) which flips it to 'sent' on success.
//     If the customer has no email on file, it stays 'draft' and is
//     flagged in the response so you can review/send it manually.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TAX_RATE = 0.05
const DEFAULT_TERMS_DAYS = 30 // matches InvoiceForm.jsx's DEFAULT_TERMS_DAYS

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: dueTemplates, error } = await supabase
    .from('recurring_invoice_templates')
    .select('*')
    .eq('active', true)
    .lte('next_run_date', today)

  if (error) return res.status(500).json({ error: error.message })

  const results = { generated: 0, errors: [] }

  for (const template of dueTemplates) {
    try {
      const invoiceNumber = await getNextInvoiceNumber(template.org_id, template.invoice_number_prefix)

      const subtotal = (template.line_items || []).reduce(
        (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
        0
      )
      const tax = subtotal * TAX_RATE
      const total = subtotal + tax

      const { data: newInvoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          org_id: template.org_id,
          customer_id: template.customer_id,
          number: invoiceNumber,
          date: today,
          due_date: addDays(today, DEFAULT_TERMS_DAYS),
          status: 'draft', // send-invoice flips this to 'sent' on success, same as handleSendInvoice()
          notes: template.notes || '',
          online_payment_enabled: template.online_payment_enabled,
          subtotal,
          tax,
          total,
          recurring_template_id: template.id,
        })
        .select()
        .single()

      if (invErr) throw invErr

      const validItems = (template.line_items || []).filter(
        (i) => i.name?.trim() && Number(i.quantity) > 0
      )
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase.from('invoice_items').insert(
          validItems.map((i) => ({
            invoice_id: newInvoice.id,
            org_id: template.org_id,
            product_id: i.product_id || null,
            name: i.name.trim(),
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price) || 0,
          }))
        )
        if (itemErr) throw itemErr
      }

      await supabase
        .from('recurring_invoice_templates')
        .update({
          next_run_date: advanceDate(template.next_run_date, template.frequency),
          last_generated_invoice_id: newInvoice.id,
        })
        .eq('id', template.id)

      // Matches handleSendInvoice() in InvoiceView.jsx: send-invoice builds
      // the PDF/email server-side and marks the invoice sent. Requires a
      // customer email on file — templates with no customer email just
      // generate the invoice without emailing it (flagged in results).
      const { data: customerRow } = await supabase
        .from('customers')
        .select('email')
        .eq('id', template.customer_id)
        .maybeSingle()

      if (customerRow?.email) {
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('company_name')
          .eq('org_id', template.org_id)
          .maybeSingle()

        const { error: sendErr } = await supabase.functions.invoke('send-invoice', {
          body: {
            invoiceId: newInvoice.id,
            orgId: template.org_id,
            to: customerRow.email,
            companyName: settings?.company_name,
            includePayNow: template.online_payment_enabled,
          },
        })
        if (sendErr) {
          results.errors.push({ templateId: template.id, stage: 'send', message: sendErr.message })
        }
      } else {
        results.errors.push({ templateId: template.id, stage: 'send', message: 'Customer has no email on file — invoice generated but not sent' })
      }

      results.generated += 1
    } catch (e) {
      results.errors.push({ templateId: template.id, message: e.message })
    }
  }

  return res.status(200).json(results)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr)
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'biweekly':
      d.setDate(d.getDate() + 14)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'quarterly':
      d.setMonth(d.getMonth() + 3)
      break
    case 'annually':
      d.setFullYear(d.getFullYear() + 1)
      break
    default:
      throw new Error(`Unknown frequency: ${frequency}`)
  }
  return d.toISOString().split('T')[0]
}

// Mirrors suggestInvoiceNumber() in InvoiceForm.jsx.
async function getNextInvoiceNumber(orgId, templatePrefixOverride) {
  let prefix = templatePrefixOverride
  if (!prefix) {
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('invoice_prefix')
      .eq('org_id', orgId)
      .maybeSingle()
    prefix = settings?.invoice_prefix ?? 'INV-'
  }

  const { data } = await supabase
    .from('invoices')
    .select('number')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (data?.length && data[0].number) {
    const lastNum = parseInt(data[0].number.replace(/\D/g, '')) || 0
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`
  }
  return `${prefix}001`
}
