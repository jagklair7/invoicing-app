/**
 * /api/helcim-init.js
 * Vercel serverless function — initializes a HelcimPay.js checkout session.
 *
 * Called by the front-end with { amount, invoiceNumber, customerCode? }
 * Returns { checkoutToken, secretToken } to the client.
 *
 * Required env vars (set in Vercel dashboard, never in source):
 *   HELCIM_API_TOKEN   — your Helcim API token from Integrations > API Access
 */

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { amount, invoiceNumber, customerCode } = req.body ?? {}

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' })
    }

    const apiToken = process.env.HELCIM_API_TOKEN
    if (!apiToken) {
      console.error('HELCIM_API_TOKEN is not set in environment variables')
      return res.status(500).json({ error: 'Payment not configured — contact support' })
    }

    const payload = {
      paymentType: 'purchase',
      amount: Number(Number(amount).toFixed(2)),
      currency: 'CAD',
    }

    if (invoiceNumber) payload.invoiceNumber = String(invoiceNumber)
    if (customerCode)  payload.customerCode  = String(customerCode)

    const helcimRes = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-token':    apiToken,
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
      console.error('Helcim init error:', JSON.stringify(data))
      const msg = data?.errors?.[0] ?? data?.message ?? 'Helcim initialization failed'
      return res.status(helcimRes.status).json({ error: msg })
    }

    return res.status(200).json({
      checkoutToken: data.checkoutToken,
      secretToken:   data.secretToken,
    })

  } catch (err) {
    console.error('helcim-init unhandled error:', err)
    return res.status(500).json({ error: 'Unexpected error initializing payment' })
  }
}