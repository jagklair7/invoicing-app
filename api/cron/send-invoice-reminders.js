// api/cron/send-invoice-reminders.js
//
// Vercel Cron endpoint — schedule daily, e.g. "0 12 * * *" (12:00 UTC),
// same schedule as generate-recurring-invoices.js. Add the corresponding
// entry to vercel.json.
//
// Sends exactly ONE overdue-payment reminder per invoice, REMINDER_DAYS_
// AFTER_DUE days after due_date, gated by the existing
// invoices.reminder_sent / reminder_sent_at columns — both already exist
// on the table, no migration needed.
//
// Scope: only invoices with status = 'sent' (never draft/paid/void) whose
// due_date is at least REMINDER_DAYS_AFTER_DUE days in the past and that
// have never been reminded (reminder_sent is null or false). Uses <=
// cutoff rather than an exact date match, on purpose: if a cron run is
// ever missed or crashes (as happened with generate-recurring-invoices.js
// before SUPABASE_URL was added), an invoice that fell through that gap
// still gets its reminder on the next successful run instead of being
// silently skipped forever, because reminder_sent is what prevents a
// second send, not the date match.
//
// REMINDERS_ENABLED_FROM: by request, this feature only applies to
// invoices created on or after the day it shipped — existing overdue
// invoices are deliberately left alone rather than getting a first-run
// wave of reminders. This is a static cutoff (not "today" at query
// time) — set once, on deploy, and never recomputed, so it keeps
// excluding pre-launch invoices permanently even months from now. No
// migration needed: this reads the invoices.created_at column that
// already exists, rather than writing anything back to old rows.
//
// Reuses the existing send-invoice Edge Function (same one InvoiceView.jsx's
// Send button and generate-recurring-invoices.js call) via a new
// `reminder: true` flag on its LEAN request body — see the corresponding
// changes in supabase/functions/send-invoice/index.ts. This avoids
// duplicating the PDF/email-building logic in a second place.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const REMINDER_DAYS_AFTER_DUE = 7

// FLAG: set to today's deploy date. Invoices created before this are
// permanently excluded from reminders — intentional, per request, not an
// oversight. Adjust only if you decide later to widen or remove the cutoff.
const REMINDERS_ENABLED_FROM = '2026-09-26T00:00:00.000Z'

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - REMINDER_DAYS_AFTER_DUE)
  const cutoffDate = cutoff.toISOString().split('T')[0]

  const { data: overdueInvoices, error } = await supabase
    .from('invoices')
    .select('id, org_id, number, due_date, customer_id, created_at')
    .eq('status', 'sent')
    .or('reminder_sent.is.null,reminder_sent.eq.false')
    .not('due_date', 'is', null)
    .lte('due_date', cutoffDate)
    .gte('created_at', REMINDERS_ENABLED_FROM)

  if (error) return res.status(500).json({ error: error.message })

  const results = { reminded: 0, errors: [] }

  for (const invoice of overdueInvoices) {
    try {
      // Same separate-lookup pattern as generate-recurring-invoices.js's
      // customer email check, rather than an embedded join, to stay
      // consistent with how that cron does it.
      const { data: customerRow } = await supabase
        .from('customers')
        .select('email')
        .eq('id', invoice.customer_id)
        .maybeSingle()

      const email = customerRow?.email
      if (!email) {
        results.errors.push({
          invoiceId: invoice.id,
          message: 'Customer has no email on file — reminder not sent. reminder_sent left false so this retries automatically once an email is added.',
        })
        continue // deliberately does NOT set reminder_sent — see message above
      }

      const { data: settings } = await supabase
        .from('organization_settings')
        .select('company_name')
        .eq('org_id', invoice.org_id)
        .maybeSingle()

      const { error: sendErr } = await supabase.functions.invoke('send-invoice', {
        body: {
          invoiceId: invoice.id,
          orgId: invoice.org_id,
          to: email,
          reminder: true,
          companyName: settings?.company_name,
        },
      })
      if (sendErr) throw sendErr

      await supabase
        .from('invoices')
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq('id', invoice.id)

      results.reminded += 1
    } catch (e) {
      results.errors.push({ invoiceId: invoice.id, message: e.message })
    }
  }

  return res.status(200).json(results)
}