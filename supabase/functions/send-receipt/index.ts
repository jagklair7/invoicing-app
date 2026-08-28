import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'invoices@digital1now.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { payment_id, pdf_base64, filename, sent_by } = await req.json()

    if (!payment_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Missing payment_id or pdf_base64' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: payment, error: paymentErr } = await supabase
      .from('invoice_payments')
      .select('*, invoices(number, customer_id, customers(name, email))')
      .eq('id', payment_id)
      .single()

    if (paymentErr || !payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const email = payment.invoices?.customers?.email
    if (!email) {
      return new Response(JSON.stringify({ error: 'Customer has no email on file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const base64Content = pdf_base64.split(',')[1] || pdf_base64

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Receipt for Invoice ${payment.invoices?.number || ''}`,
        html: `<p>Hi ${payment.invoices?.customers?.name || ''},</p>
               <p>Thank you for your payment. Please find your receipt attached
               for invoice <strong>${payment.invoices?.number}</strong>.</p>`,
        attachments: [
          {
            filename: filename || 'receipt.pdf',
            content: base64Content,
          },
        ],
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      return new Response(JSON.stringify({ error: `Resend failed: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await supabase
      .from('invoice_payments')
      .update({
        receipt_sent_at: new Date().toISOString(),
        receipt_sent_by: sent_by ?? null,
      })
      .eq('id', payment_id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})