/**
 * /api/helcim-refund.js
 * Vercel serverless function — processes a refund for either:
 *   (a) a paid org subscription ({ orgId }), or
 *   (b) a payment that never resolved into an org ({ pendingPaymentId })
 * Both within the 15-day refund policy.
 *
 * Called with the caller's Supabase auth token in the Authorization header.
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

    const { orgId, pendingPaymentId } = req.body ?? {}
    if (!orgId && !pendingPaymentId) {
      return res.status(400).json({ error: 'orgId or pendingPaymentId is required' })
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // 1. Re-check eligibility server-side, branching by which kind of
    //    record this is. Both RPCs enforce super-admin authorization.
    const eligibilityRpc = orgId ? 'get_refund_eligibility' : 'get_pending_payment_refund_eligibility'
    const eligibilityArgs = orgId ? { org_id_input: orgId } : { pending_payment_id: pendingPaymentId }

    const { data: eligibility, error: eligErr } = await supabase.rpc(eligibilityRpc, eligibilityArgs)
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
    // NOTE: ipAddress here is the refund request's origin, not necessarily
    // the original payer's IP — see prior flag on this endpoint.
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
        'idempotency-key': `refund-${orgId || pendingPaymentId}-${Date.now()}`,
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

    // 3. Mark refunded locally, branching the same way as step 1.
    const markRpc = orgId ? 'mark_subscription_refunded' : 'mark_pending_payment_refunded'
    const markArgs = orgId ? { org_id_input: orgId } : { pending_payment_id: pendingPaymentId }

    const { data: updated, error: markErr } = await supabase.rpc(markRpc, markArgs)
    if (markErr) {
      console.error('Refund succeeded at Helcim but marking refunded failed:', markErr)
      return res.status(500).json({
        error: `Refund was processed by Helcim but updating the record failed — resolve manually for ${orgId ? 'org ' + orgId : 'pending payment ' + pendingPaymentId}`,
      })
    }

    return res.status(200).json({ refund: data, record: updated })

  } catch (err) {
    console.error('helcim-refund unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error processing refund' })
  }
}