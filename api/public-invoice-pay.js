/**
 * /api/public-invoice-pay.js
 * Vercel serverless function — initializes a HelcimPay.js checkout session
 * for the customer-facing public "Pay Now" link (InvoicePublic.jsx, route
 * /i/:token). Mirrors /api/helcim-init.js's actual Helcim integration
 * exactly (same endpoint, headers, payload shape) — that file is the
 * verified source of truth for how Helcim is wired up in this app.
 *
 * Unlike /api/helcim-init.js (called by logged-in staff, who supply their
 * own amount/customerCode), this route is public/unauthenticated, so it
 * does NOT trust the amount from the request body — it looks the invoice
 * up server-side by its public_token via Supabase service-role access
 * (bypassing RLS) and takes the amount, status, and online_payment_enabled
 * flag from that row. This mirrors the same trust boundary already
 * documented in src/pages/InvoicePublic.jsx and
 * supabase/functions/send-invoice/index.ts's computePayUrl().
 *
 * ADJUSTED TOTAL: if invoices.adjusted_total (tax-inclusive, negotiated) is
 * set, that is the amount charged, and taxAmount is the tax backed out of it
 * using the invoice's own tax_pct/tax2_pct (NULL tax_pct = legacy 5% GST).
 * It is read straight from the invoices row by public_token rather than from
 * the get_invoice_by_token RPC, because that RPC's output shape hasn't been
 * verified to include adjusted_total.
 *
 * Called by the front-end with { token }
 * Returns { checkoutToken, secretToken } to the client, same shape as
 * /api/helcim-init.js.
 *
 * Required env vars (set in Vercel dashboard, never in source):
 *   HELCIM_API_TOKEN            — same one /api/helcim-init.js uses
 *   VITE_SUPABASE_URL           — confirmed present in this Vercel project
 *                                  (Production and Preview); the Vite
 *                                  prefix is just this app's naming
 *                                  convention for the var, it's read here
 *                                  the same as any other server env var
 *   SUPABASE_SERVICE_ROLE_KEY   — confirmed present in this Vercel project
 */

import { createClient } from '@supabase/supabase-js'

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Tax included in a tax-inclusive total. Mirrors adjustedTaxBreakdown() in
// src/utils/invoiceAdjustment.js (total tax only — Helcim just needs one figure).
function taxIncludedIn(adjustedTotal, row) {
  const pct1 = row?.tax_pct == null ? 5 : Number(row.tax_pct) || 0
  const pct2 = row?.tax_pct == null ? 0 : (Number(row.tax2_pct) || 0)
  const totalPct = pct1 + pct2
  return totalPct > 0 ? round2(adjustedTotal * totalPct / (100 + totalPct)) : 0
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { token } = req.body ?? {}
    if (!token) {
      return res.status(400).json({ error: 'Missing token' })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment variables')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Same RPC InvoicePublic.jsx already uses to load the invoice by token —
    // reused here server-side so the amount/status come from the database,
    // never from the request body.
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('get_invoice_by_token', {
      p_token: token,
    })

    if (rpcErr || !result) {
      console.error('public-invoice-pay: invoice lookup failed', rpcErr?.message)
      return res.status(404).json({ error: 'Invoice not found' })
    }

    const { invoice } = result

    if (!invoice?.online_payment_enabled) {
      return res.status(400).json({ error: 'Online payment is not enabled for this invoice' })
    }
    if (invoice.status === 'paid' || invoice.status === 'void') {
      return res.status(400).json({ error: 'This invoice is not payable' })
    }

    // Authoritative amount fields straight from the invoices row (service
    // role, keyed by the same public_token the RPC used).
    const { data: amountRow, error: amountErr } = await supabaseAdmin
      .from('invoices')
      .select('total, tax, adjusted_total, tax_pct, tax2_pct')
      .eq('public_token', token)
      .single()

    if (amountErr || !amountRow) {
      console.error('public-invoice-pay: amount lookup failed', amountErr?.message)
      return res.status(404).json({ error: 'Invoice not found' })
    }

    const hasAdjusted = amountRow.adjusted_total !== null && amountRow.adjusted_total !== undefined
    const chargeAmount = hasAdjusted ? Number(amountRow.adjusted_total) : Number(amountRow.total)
    const chargeTax = hasAdjusted
      ? taxIncludedIn(chargeAmount, amountRow)
      : (amountRow.tax != null ? Number(amountRow.tax) : null)

    const apiToken = process.env.HELCIM_API_TOKEN
    if (!apiToken) {
      console.error('HELCIM_API_TOKEN is not set in environment variables')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    // Same payload shape as /api/helcim-init.js. invoiceNumber and
    // customerCode are both omitted, matching helcim-init.js's own
    // commented-out invoiceNumber (Helcim validation is strict about
    // format) and this route's lack of a customer-code mapping for the
    // public flow — see file header.
    const payload = {
      paymentType: 'purchase',
      amount: Number(chargeAmount.toFixed(2)),
      currency: 'CAD',
    }
    if (chargeTax != null) {
      payload.taxAmount = Number(Number(chargeTax).toFixed(2))
    }

    const helcimRes = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-token': apiToken,
      },
      body: JSON.stringify(payload),
    })

    const text = await helcimRes.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('Helcim non-JSON response:', text)
      return res.status(502).json({ error: 'Unexpected response from payment provider' })
    }

    if (!helcimRes.ok) {
      console.error('Helcim init error (public):', JSON.stringify(data))
      const msg = JSON.stringify(data)
      return res.status(helcimRes.status).json({ error: msg })
    }

    return res.status(200).json({
      checkoutToken: data.checkoutToken,
      secretToken: data.secretToken,
    })
  } catch (err) {
    console.error('public-invoice-pay unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error initializing payment' })
  }
}