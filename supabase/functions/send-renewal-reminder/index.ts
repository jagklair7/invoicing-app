// Emails the owner (you) that a custom plan is due for renewal in <= 7 days.
// Invoked by api/cron/trial-lifecycle.js with { orgId }.
// Idempotent per period: renewal_reminder_for stores the current_period_end already reminded,
// so extending the period automatically re-arms the reminder.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ASSUMED values - verify against send-trial-warning / send-receipt:
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = Deno.env.get('RENEWAL_FROM_EMAIL') ?? 'Klair <noreply@klair.ca>'
const TO = Deno.env.get('RENEWAL_NOTIFY_EMAIL') ?? 'jag@klair.ca'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-CA', { dateStyle: 'long', timeZone: 'America/Edmonton' })

Deno.serve(async (req) => {
  try {
    const { orgId } = await req.json()
    if (!orgId) return json({ error: 'orgId required' }, 400)
    if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not set' }, 500)

    const { data: sub, error: subErr } = await supabase
      .from('org_subscriptions')
      .select('org_id, status, current_period_end, renewal_reminder_for, custom_price, custom_currency, billing_interval, plans(name, is_custom)')
      .eq('org_id', orgId)
      .single()
    if (subErr || !sub) return json({ sent: false, reason: 'no subscription' })

    if (!sub.plans?.is_custom || sub.status !== 'active' || !sub.current_period_end) {
      return json({ sent: false, reason: 'not an active custom plan' })
    }

    const periodEnd = new Date(sub.current_period_end)
    if (sub.renewal_reminder_for && new Date(sub.renewal_reminder_for).getTime() === periodEnd.getTime()) {
      return json({ sent: false, reason: 'already reminded for this period' })
    }

    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single()
    const orgName = org?.name ?? orgId
    const graceEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000)

    const subject = `Renewal due ${fmtDate(periodEnd)}: ${orgName} (custom plan)`
    const html = `
      <p>The custom plan for <strong>${esc(orgName)}</strong> is due for renewal.</p>
      <ul>
        <li>Price: ${sub.custom_price} ${esc(sub.custom_currency ?? 'CAD')} / ${esc(sub.billing_interval ?? '')}</li>
        <li>Period ends: ${fmtDate(periodEnd)}</li>
        <li>Drops to Free after the 7-day grace period: ${fmtDate(graceEnd)}</li>
      </ul>
      <p>Once they have paid, run in the Supabase SQL editor:</p>
      <pre>select renew_custom_plan('${orgId}');</pre>
    `

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
    })
    if (!resp.ok) return json({ error: `Resend ${resp.status}: ${await resp.text()}` }, 502)

    await supabase
      .from('org_subscriptions')
      .update({ renewal_reminder_for: sub.current_period_end })
      .eq('org_id', orgId)

    return json({ sent: true })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})