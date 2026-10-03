/**
 * /api/helcim-plan-confirm.js
 * Vercel serverless function — verifies a plan payment and records it.
 *
 * Called by the browser after HelcimPay.js reports success, with the logged-in
 * user's Supabase token and { checkoutToken, helcimResponse }. Nothing the
 * browser says about price, plan, or org name is trusted; those come from the
 * helcim_checkouts row created by /api/helcim-plan-checkout.
 *
 * A payment is recorded as VERIFIED only when ALL of these hold:
 *   1. the response hash validates against the stored secretToken (Helcim's
 *      documented SHA-256 check),
 *   2. Helcim's own API shows that transaction as an APPROVED purchase for the
 *      expected amount in CAD,
 *   3. the checkout belongs to the logged-in user, and is under 2 hours old,
 *   4. the transaction id hasn't been used before (unique index).
 * Anything else that might still be a real charge is saved UNVERIFIED so it
 * shows up in Admin → Organizations → "Payments Needing Attention".
 *
 * Required env vars: HELCIM_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const MAX_CHECKOUT_AGE_MS = 2 * 60 * 60 * 1000

// Pulls { data, hash } out of whatever shape the HelcimPay.js event arrives in
// (eventMessage may be a JSON string or an object; data/hash may also sit at
// the top level).
function extractResult(resp) {
  let r = resp
  if (typeof r === 'string') {
    try { r = JSON.parse(r) } catch { return null }
  }
  let msg = r?.eventMessage
  if (typeof msg === 'string') {
    try { msg = JSON.parse(msg) } catch { msg = null }
  }
  const data = msg?.data ?? r?.data ?? null
  const hash = msg?.hash ?? r?.hash ?? null
  return data ? { data, hash } : null
}

// Helcim documents the check as SHA-256 of (JSON-encoded response data + secretToken).
// Their examples are PHP, whose json_encode escapes "/" and non-ASCII characters
// by default, so accept those variants as well as plain JSON.stringify output.
function hashCandidates(data, secret) {
  const compact = JSON.stringify(data)
  const slashEscaped = compact.replace(/\//g, '\\/')
  const asciiEscape = (s) =>
    s.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  const variants = [compact, slashEscaped, asciiEscape(compact), asciiEscape(slashEscaped)]
  return [...new Set(variants)].map((v) =>
    crypto.createHash('sha256').update(v + secret).digest('hex')
  )
}

function hashMatches(data, hash, secret) {
  if (!hash || !secret) return false
  const given = String(hash).toLowerCase()
  return hashCandidates(data, secret).some(
    (c) => c.length === given.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(given))
  )
}

// Returns the transaction object, or null if Helcim says it doesn't exist.
// Throws if Helcim can't be reached (after one retry).
async function fetchHelcimTransaction(transactionId, apiToken) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(
        `https://api.helcim.com/v2/card-transactions/${encodeURIComponent(transactionId)}`,
        { headers: { accept: 'application/json', 'api-token': apiToken } }
      )
      if (r.ok) return await r.json()
      if (r.status === 404 || r.status === 400) return null
    } catch (e) {
      // fall through and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error('could not reach Helcim to verify the payment')
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HELCIM_API_TOKEN } = process.env
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HELCIM_API_TOKEN) {
      console.error('helcim-plan-confirm: missing env vars')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    const user = userData?.user
    if (userErr || !user) return res.status(401).json({ error: 'Not authenticated' })

    const { checkoutToken, helcimResponse } = req.body ?? {}
    if (!checkoutToken) return res.status(400).json({ error: 'checkoutToken is required' })

    const { data: checkout } = await admin
      .from('helcim_checkouts')
      .select('*')
      .eq('checkout_token', checkoutToken)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!checkout) return res.status(404).json({ error: 'Checkout not found' })

    // Idempotent: already verified → hand back the same record.
    if (checkout.status === 'verified') {
      const { data: existing } = await admin
        .from('pending_org_payments')
        .select('id')
        .eq('checkout_id', checkout.id)
        .maybeSingle()
      if (existing) return res.status(200).json({ pendingPaymentId: existing.id })
    }

    const parsed = extractResult(helcimResponse)
    const transactionId =
      parsed?.data?.transactionId != null ? String(parsed.data.transactionId) : null
    if (!transactionId) {
      console.error('helcim-plan-confirm: no transactionId in response; keys:',
        parsed?.data ? Object.keys(parsed.data) : null)
      return res.status(400).json({ error: 'The payment response did not include a transaction id' })
    }

    // ── Verification ─────────────────────────────────────────────────────────
    const problems = []

    if (!hashMatches(parsed.data, parsed.hash, checkout.secret_token)) {
      problems.push('response hash did not validate')
    }

    let tx = null
    let lookupFailed = false
    try {
      tx = await fetchHelcimTransaction(transactionId, HELCIM_API_TOKEN)
    } catch (e) {
      lookupFailed = true
      problems.push(e.message)
    }

    if (!lookupFailed) {
      if (!tx) {
        problems.push('Helcim has no such transaction')
      } else {
        if (String(tx.status).toUpperCase() !== 'APPROVED') problems.push(`transaction status is ${tx.status}`)
        if (String(tx.type).toLowerCase() !== 'purchase') problems.push(`transaction type is ${tx.type}`)
        if (Math.abs(Number(tx.amount) - Number(checkout.amount)) > 0.005) {
          problems.push(`amount ${tx.amount} does not match expected ${checkout.amount}`)
        }
        if (tx.currency && String(tx.currency).toUpperCase() !== 'CAD') {
          problems.push(`currency is ${tx.currency}`)
        }
      }
    }

    if (Date.now() - new Date(checkout.created_at).getTime() > MAX_CHECKOUT_AGE_MS) {
      problems.push('checkout is more than 2 hours old')
    }

    const baseRow = {
      user_id: user.id,
      org_name: checkout.org_name,        // from the checkout, never from the browser
      plan_id: checkout.plan_id,
      helcim_transaction_id: transactionId,
      base_amount: checkout.base_amount,
      gst_amount: checkout.gst_amount,
      amount: checkout.amount,
      checkout_id: checkout.id,
    }

    if (problems.length > 0) {
      console.error('helcim-plan-confirm: NOT verified', {
        transactionId, checkoutId: checkout.id, problems,
        responseKeys: parsed?.data ? Object.keys(parsed.data) : null,
      })

      // If a real charge may exist, keep a record so it can be handled by hand.
      const mayBeRealCharge =
        lookupFailed || (tx && String(tx.status).toUpperCase() === 'APPROVED')
      if (mayBeRealCharge) {
        const { error: reviewErr } = await admin.from('pending_org_payments').insert({
          ...baseRow,
          verified: false,
          error_message: problems.join('; ').slice(0, 500),
        })
        if (reviewErr && reviewErr.code !== '23505') {
          console.error('helcim-plan-confirm: could not save review record:', reviewErr)
        }
      }
      return res.status(409).json({
        error:
          `We received your payment (transaction ${transactionId}) but could not verify it automatically. ` +
          `Please contact support — do not pay again.`,
      })
    }

    // ── Verified ─────────────────────────────────────────────────────────────
    const { data: pending, error: insertErr } = await admin
      .from('pending_org_payments')
      .insert({
        ...baseRow,
        verified: true,
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        // This transaction is already recorded. Safe to return it only if it's this user's verified one.
        const { data: dup } = await admin
          .from('pending_org_payments')
          .select('id, verified')
          .eq('helcim_transaction_id', transactionId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (dup?.verified) return res.status(200).json({ pendingPaymentId: dup.id })
        return res.status(409).json({ error: 'This payment has already been used' })
      }
      console.error('helcim-plan-confirm: insert failed:', insertErr)
      return res.status(500).json({ error: 'Could not record your payment — contact support, do not pay again' })
    }

    await admin
      .from('helcim_checkouts')
      .update({ status: 'verified', used_at: new Date().toISOString() })
      .eq('id', checkout.id)

    return res.status(200).json({ pendingPaymentId: pending.id })

  } catch (err) {
    console.error('helcim-plan-confirm unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error verifying payment' })
  }
}