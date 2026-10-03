/**
 * /api/helcim-plan-checkout.js
 * Vercel serverless function — starts a HelcimPay.js checkout for BUYING A PLAN.
 *
 * Unlike /api/helcim-init.js, nothing about the price comes from the browser:
 * the caller sends only { planId, orgName } plus their Supabase login token.
 * The server looks the price up in `plans`, adds GST, initializes Helcim, and
 * keeps Helcim's secretToken (never returned to the browser) so
 * /api/helcim-plan-confirm can validate the payment response later.
 *
 * Required env vars (already used by your other routes):
 *   HELCIM_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

// Keep in sync with GST_RATE in Onboarding.jsx / CreateOrganization.jsx.
// (Whether 5% is right for out-of-province buyers is a question for your accountant.)
const GST_RATE = 0.05
const MAX_CHECKOUTS_PER_HOUR = 10

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

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
      console.error('helcim-plan-checkout: missing env vars')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    const user = userData?.user
    if (userErr || !user) return res.status(401).json({ error: 'Not authenticated' })

    const { planId, orgName } = req.body ?? {}
    const cleanName = typeof orgName === 'string' ? orgName.trim() : ''
    if (!planId || !cleanName || cleanName.length > 120) {
      return res.status(400).json({ error: 'A plan and an organization name are required' })
    }

    const { data: plan } = await admin
      .from('plans')
      .select('id, name, price_monthly')
      .eq('id', planId)
      .maybeSingle()
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    const base = round2(Number(plan.price_monthly) || 0)
    if (base <= 0) return res.status(400).json({ error: 'This plan is free — no payment needed' })
    const gst = round2(base * GST_RATE)
    const total = round2(base + gst)

    // Basic abuse guard: a handful of checkouts per user per hour is plenty.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('helcim_checkouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since)
    if ((count ?? 0) >= MAX_CHECKOUTS_PER_HOUR) {
      return res.status(429).json({ error: 'Too many checkout attempts — please try again later' })
    }

    // taxAmount is informational and already included in amount (see helcim-init.js).
    const helcimRes = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-token': HELCIM_API_TOKEN,
      },
      body: JSON.stringify({
        paymentType: 'purchase',
        amount: total,
        currency: 'CAD',
        taxAmount: gst,
      }),
    })

    const text = await helcimRes.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('helcim-plan-checkout: non-JSON response from Helcim:', text)
      return res.status(502).json({ error: 'Unexpected response from payment provider' })
    }
    if (!helcimRes.ok || !data.checkoutToken || !data.secretToken) {
      console.error('helcim-plan-checkout: Helcim init error:', JSON.stringify(data))
      return res.status(502).json({ error: 'Could not start the payment — please try again' })
    }

    const { error: insertErr } = await admin.from('helcim_checkouts').insert({
      user_id: user.id,
      plan_id: plan.id,
      org_name: cleanName,
      checkout_token: data.checkoutToken,
      secret_token: data.secretToken,
      base_amount: base,
      gst_amount: gst,
      amount: total,
    })
    if (insertErr) {
      console.error('helcim-plan-checkout: could not save checkout:', insertErr)
      return res.status(500).json({ error: 'Could not start the payment — please try again' })
    }

    // The secretToken stays on the server.
    return res.status(200).json({ checkoutToken: data.checkoutToken, amount: total })

  } catch (err) {
    console.error('helcim-plan-checkout unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error starting payment' })
  }
}