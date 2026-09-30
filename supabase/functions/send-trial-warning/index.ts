import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DAY_MS = 24 * 60 * 60 * 1000
const WARNING_DAYS = 3

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: Deno.env.get('TRIAL_FROM_EMAIL'), to: [to], subject, html }),
  })
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`)
}

// Called by api/cron/trial-lifecycle.js. The function re-checks that the org is
// actually due for a warning, so a stray call can at most send the legitimate
// email early, and only once (trial_warning_sent_at is stamped after sending).
Deno.serve(async (req) => {
  try {
    const { orgId } = await req.json()
    if (!orgId) return json({ error: 'orgId is required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: sub } = await admin
      .from('org_subscriptions')
      .select('trial_ends_at, trial_warning_sent_at, helcim_transaction_id')
      .eq('org_id', orgId)
      .maybeSingle()

    const now = Date.now()
    const endsMs = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null
    const due =
      sub &&
      endsMs !== null &&
      !sub.trial_warning_sent_at &&
      !sub.helcim_transaction_id &&
      endsMs > now &&
      endsMs - now <= WARNING_DAYS * DAY_MS
    if (!due) return json({ ok: true, skipped: true })

    const { data: org } = await admin
      .from('organizations')
      .select('name, owner_id')
      .eq('id', orgId)
      .single()
    if (!org) return json({ error: 'Organization not found' }, 404)

    const { data: owner } = await admin.auth.admin.getUserById(org.owner_id)
    const to = owner?.user?.email
    if (!to) return json({ error: 'Owner has no email address' }, 422)

    const endsLabel = new Date(endsMs!).toLocaleDateString('en-CA', {
      timeZone: 'America/Edmonton',
      dateStyle: 'long',
    })
    const daysLeft = Math.max(1, Math.ceil((endsMs! - now) / DAY_MS))

    await sendEmail(
      to,
      `Your Pro trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      `<p>Your Pro trial for <strong>${esc(org.name)}</strong> ends on <strong>${endsLabel}</strong>.</p>
       <p>To keep Pro, subscribe before then. If you don't, your account returns to the Free version
       when the trial ends. Your existing data is kept.</p>
       <p><a href="${Deno.env.get('APP_URL')}">Open your account</a></p>`
    )

    // Stamp only after a successful send, so a failed send retries on the next run
    await admin
      .from('org_subscriptions')
      .update({ trial_warning_sent_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .is('trial_warning_sent_at', null)

    return json({ ok: true, sent: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong' }, 500)
  }
})