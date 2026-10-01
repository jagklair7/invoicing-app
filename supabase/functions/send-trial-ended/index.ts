import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DAY_MS = 24 * 60 * 60 * 1000
const NOTICE_WINDOW_DAYS = 3

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

// Called by api/cron/trial-lifecycle.js. Re-checks that this org really just
// finished an unpaid trial and has not been emailed yet, so a stray call can
// at most send the legitimate email once (trial_ended_email_sent_at is
// stamped after a successful send).
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
      .select('plan_id, trial_ends_at, trial_ended_at, trial_ended_email_sent_at')
      .eq('org_id', orgId)
      .maybeSingle()

    const { data: freePlan } = await admin
      .from('plans')
      .select('id')
      .eq('name', 'free')
      .maybeSingle()

    const endedMs = sub?.trial_ended_at ? new Date(sub.trial_ended_at).getTime() : null
    const due =
      sub &&
      freePlan &&
      endedMs !== null &&
      !sub.trial_ended_email_sent_at &&
      sub.trial_ends_at === null &&
      sub.plan_id === freePlan.id &&
      Date.now() - endedMs <= NOTICE_WINDOW_DAYS * DAY_MS
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

    await sendEmail(
      to,
      'Your Pro trial has ended',
      `<p>Your Pro trial for <strong>${esc(org.name)}</strong> has ended, and your account is now on the Free version.</p>
       <p>Everything you've created (invoices, customers, and the rest of your data) is still there.
       Pro features and higher limits are switched off.</p>
       <p>Want Pro back? Contact us at
       <a href="mailto:${Deno.env.get('TRIAL_ADMIN_EMAIL')}">${esc(Deno.env.get('TRIAL_ADMIN_EMAIL') ?? '')}</a>
       and we'll set it up.</p>
       <p><a href="${Deno.env.get('APP_URL')}">Open your account</a></p>`
    )

    // Stamp only after a successful send, so a failed send retries on the next run
    await admin
      .from('org_subscriptions')
      .update({ trial_ended_email_sent_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .is('trial_ended_email_sent_at', null)

    return json({ ok: true, sent: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong' }, 500)
  }
})