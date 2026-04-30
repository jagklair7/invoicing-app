import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'invoices@digital1now.com'

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data: overdue } = await supabase
    .from('invoices')
    .select('*, customers(*)')
    .in('status', ['sent'])
    .lt('due_date', today)
    .eq('reminder_sent', false)

  for (const inv of overdue ?? []) {
    const email = inv.customers?.email
    if (!email) continue

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Reminder: Invoice ${inv.number} is overdue`,
        html: `<p>Hi ${inv.customers.name},</p>
               <p>Invoice <strong>${inv.number}</strong> for <strong>$${inv.total}</strong> 
               was due on ${inv.due_date} and remains unpaid.</p>`,
      }),
    })

    await supabase.from('invoices')
      .update({ reminder_sent: true })
      .eq('id', inv.id)
  }

  return new Response(JSON.stringify({ reminded: overdue?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' }
  })
})