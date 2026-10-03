// src/utils/planCheckout.js
// Browser side of the plan-purchase flow. The server prices the plan and
// verifies the payment; this file only carries the user's login token to it.
import { supabase } from '../app/supabaseClient'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('You are signed out — please sign in again.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// Starts a checkout for a plan. Returns { checkoutToken } for HelcimPay.js.
export async function startPlanCheckout({ planId, orgName }) {
  const res = await fetch('/api/helcim-plan-checkout', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ planId, orgName }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.checkoutToken) {
    throw new Error(data.error || 'Could not start checkout')
  }
  return { checkoutToken: data.checkoutToken }
}

// Sends Helcim's response to the server for verification.
// `meta` is the second argument useHelcimPay passes to onSuccess.
export async function confirmPlanPayment(meta) {
  const res = await fetch('/api/helcim-plan-confirm', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ checkoutToken: meta?.checkoutToken, helcimResponse: meta?.raw }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.pendingPaymentId) {
    throw new Error(data.error || 'Could not verify your payment')
  }
  return { pendingPaymentId: data.pendingPaymentId }
}