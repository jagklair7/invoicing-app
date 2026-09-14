/**
 * /api/helcim-refund.js
 * Vercel serverless function — processes a refund for a paid org
 * subscription, within the 15-day refund policy.
 *
 * Called by admin/Organizations.jsx with { orgId } and the caller's
 * Supabase auth token in the Authorization header.
 *
 * Required env vars:
 *   HELCIM_API_TOKEN    — same as helcim-init.js
 *   SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_ANON_KEY     — Supabase anon/public key (RLS + the RPCs'
 *                            own is_super_admin check are the actual
 *                            authorization boundary here, not this key)
 */

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { orgId } = req.body ?? {}
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' })
    }

    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('SUPABASE_URL or SUPABASE_ANON_KEY not set')
      return res.status(500).json({ error: 'Server not configured — contact support' })
    }

    // Scoped to the caller's own JWT, so auth.uid() inside the RPCs below
    // resolves to this user — the is_super_admin check happens in Postgres,
    // not here.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // 1. Re-check eligibility server-side. Never trust a client-supplied
    //    "yes it's eligible" — this call re-derives it from the DB and
    //    also enforces the super-admin check.
    const { data: eligibility, error: eligErr } = await supabase
      .rpc('get_refund_eligibility', { org_id_input: orgId })
    if (eligErr) {
      return res.status(403).json({ error: eligErr.message })
    }
    if (!eligibility?.eligible) {
      return res.status(400).json({ error: eligibility?.reason || 'Not eligible for refund' })
    }

    const apiToken = process.env.HELCIM_API_TOKEN
    if (!apiToken) {
      console.error('HELCIM_API_TOKEN is not set in environment variables')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    // 2. Actually refund the charge through Helcim.
    // NOTE: ipAddress here is the refund request's origin (this server's
    // view of the admin's IP), not necessarily the original payer's IP —
    // Helcim's docs don't fully clarify which is expected. Confirm with
    // Helcim support if a refund is rejected for an IP-related reason.
    const ipAddress =
      (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
      req.socket?.remoteAddress ||
      '0.0.0.0'

    const helcimRes = await fetch('https://api.helcim.com/v2/payment/refund', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-token': apiToken,
        'idempotency-key': `refund-${orgId}-${Date.now()}`,
      },
      body: JSON.stringify({
        originalTransactionId: Number(eligibility.helcim_transaction_id),
        amount: Number(eligibility.amount),
        ipAddress,
      }),
    })

    const text = await helcimRes.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('Helcim non-JSON refund response:', text)
      return res.status(502).json({ error: 'Unexpected response from payment provider' })
    }

    if (!helcimRes.ok) {
      console.error('Helcim refund error:', JSON.stringify(data))
      return res.status(helcimRes.status).json({ error: JSON.stringify(data) })
    }

    // 3. Money is back with the customer — now mark it refunded locally
    //    and downgrade the org to free. This RPC re-validates eligibility
    //    one more time (defense in depth) before writing anything.
    const { data: updated, error: markErr } = await supabase
      .rpc('mark_subscription_refunded', { org_id_input: orgId })
    if (markErr) {
      // Refund succeeded at Helcim but DB update failed — surface this
      // loudly, don't swallow it, since the org is now in an inconsistent
      // state (refunded with Helcim, still shown as paid in your DB).
      console.error('Refund succeeded at Helcim but mark_subscription_refunded failed:', markErr)
      return res.status(500).json({
        error: 'Refund was processed by Helcim but updating the record failed — update org_subscriptions manually for org ' + orgId,
      })
    }

    return res.status(200).json({ refund: data, subscription: updated })

  } catch (err) {
    console.error('helcim-refund unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error processing refund' })
  }
}