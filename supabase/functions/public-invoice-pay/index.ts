// supabase/functions/public-invoice-pay/index.ts
//
// DRAFT — DO NOT DEPLOY AS-IS. I do not have PayNowButton.jsx, the existing
// Helcim charge Edge Function, or your Helcim API credentials/env var names,
// so this guesses at Helcim's standard "Initialize HelcimPay.js" REST API
// rather than mirroring your real integration. Please share those files —
// this almost certainly needs changes to:
//   - the Helcim API endpoint/payload shape you actually use
//   - the env var name for the Helcim API token (guessed as HELCIM_API_TOKEN)
//   - how a successful payment gets recorded (I don't have your `payments`
//     table schema that PaymentsSection.jsx reads from, so this only flips
//     invoices.status to 'paid' — it does NOT insert a payments row, which
//     may make the invoice look paid without a matching payment record)
//   - webhook vs. client-callback confirmation: this trusts a second call
//     from the client after HelcimPay.js reports SUCCESS, which is the
//     minimum safe pattern (never trust the client alone — this still does
//     a server-side verify() call against Helcim before marking paid) but
//     if you already have a Helcim webhook configured, that's more robust
//     and this should defer to it instead.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const HELCIM_API_TOKEN = Deno.env.get('HELCIM_API_TOKEN') // FLAG: verify this env var name against your existing Helcim setup

Deno.serve(async (req) => {
  try {
    const { token } = await req.json()
    if (!token) return errorResponse('Missing token', 400)

    const { data: invoiceData, error: rpcErr } = await supabase.rpc('get_invoice_by_token', {
      p_token: token,
    })
    if (rpcErr || !invoiceData) return errorResponse('Invoice not found', 404)

    const { invoice } = invoiceData
    if (!invoice.online_payment_enabled) return errorResponse('Online payment not enabled for this invoice', 400)
    if (invoice.status === 'paid' || invoice.status === 'void') return errorResponse('Invoice is not payable', 400)

    // FLAG: endpoint + payload shape below follow Helcim's published
    // "Initialize HelcimPay.js" API as of general public docs — verify
    // against whatever's actually configured for this Helcim account.
    const helcimRes = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
      method: 'POST',
      headers: {
        'api-token': HELCIM_API_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentType: 'purchase',
        amount: invoice.total,
        currency: 'CAD',
        invoiceNumber: invoice.number,
      }),
    })

    if (!helcimRes.ok) {
      const body = await helcimRes.text()
      console.error('Helcim initialize failed:', body)
      return errorResponse('Could not start payment session', 502)
    }

    const helcimData = await helcimRes.json()
    // FLAG: field names (checkoutToken / secretToken) assumed from Helcim's
    // documented response shape — confirm against a real response.
    return new Response(
      JSON.stringify({ checkoutToken: helcimData.checkoutToken }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return errorResponse('Unexpected error', 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// NOT YET IMPLEMENTED: a confirm/webhook step that (a) calls Helcim's
// transaction-verify API server-side, (b) updates invoices.status = 'paid'
// only after that server-side verification succeeds, and (c) inserts a
// matching row into whatever table PaymentsSection.jsx reads from. Needs
// your payments table schema and existing charge Edge Function before I
// build this — marking invoices paid off an unverified client event would
// be a real gap, so I've left it out rather than guess at it.
