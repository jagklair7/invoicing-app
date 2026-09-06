import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

// FROM_EMAIL, if set, is an explicit full override ("Name <address>") and
// always wins — kept for backward compatibility with existing deployments
// that pin this. Otherwise the sender NAME is built dynamically per org
// (see isFreeTier below) while the address stays fixed to a domain that's
// actually verified in Resend — Resend rejects sends from unverified
// domains, so we can't let the org's own domain through here even on paid
// plans, only the display name changes.
const FROM_EMAIL_OVERRIDE = Deno.env.get('FROM_EMAIL')
const FROM_EMAIL_ADDRESS  = Deno.env.get('FROM_EMAIL_ADDRESS') || 'invoices@digital1now.com'
const DEFAULT_SENDER_NAME = 'Klair'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Always handle OPTIONS first
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { to, subject, html, pdfBase64, filename, companyName, planName } = body

    // Free tier (or no subscription row at all) keeps the default Klair
    // Computer branding; any paid plan sends under the org's own name.
    const isFreeTier  = !planName || planName.toLowerCase() === 'free'
    const senderName  = (!isFreeTier && companyName?.trim()) ? companyName.trim() : DEFAULT_SENDER_NAME
    const fromAddress = FROM_EMAIL_OVERRIDE || `Invoice from ${senderName} <${FROM_EMAIL_ADDRESS}>`

    console.log('send-invoice: request received', {
      to,
      subject,
      hasPdf: !!pdfBase64,
      pdfLength: pdfBase64?.length || 0,
      companyName,
      planName,
      isFreeTier,
      fromAddress,
      resendKeyPresent: !!RESEND_API_KEY,
      resendKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.slice(0, 6) : null,
    })

    if (!to || !subject) {
      console.log('send-invoice: missing to/subject, rejecting')
      return new Response(JSON.stringify({ error: 'Missing to or subject' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Only attach PDF if we actually have one
    const attachments = []
    if (pdfBase64 && pdfBase64.length > 100) {
      const base64Data = pdfBase64.includes(',')
        ? pdfBase64.split(',')[1]
        : pdfBase64
      attachments.push({ filename: filename || 'invoice.pdf', content: base64Data })
    }

    const payload = {
      from: fromAddress,
      to: [to],
      subject,
      html,
      ...(attachments.length > 0 && { attachments }),
    }

    console.log('send-invoice: calling Resend', {
      from: payload.from,
      to: payload.to,
      attachmentCount: attachments.length,
    })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    console.log('send-invoice: Resend responded', {
      status: res.status,
      ok: res.ok,
      data,
    })

    if (!res.ok) {
      console.error('send-invoice: Resend rejected the request', data)
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('send-invoice: success, Resend id =', data.id)

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-invoice: unhandled exception', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
