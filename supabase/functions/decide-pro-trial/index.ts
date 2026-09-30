import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRIAL_DAYS = 15

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    // Same authorization rule your refund functions use
    const { data: profile } = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.is_super_admin) return json({ error: 'Not authorized' }, 403)

    const { requestId, action } = await req.json()
    if (!requestId || !['get', 'approve', 'deny'].includes(action)) {
      return json({ error: 'requestId and a valid action are required' }, 400)
    }

    // Read-only lookup for the approval page
    if (action === 'get') {
      const { data: row } = await admin
        .from('trial_requests')
        .select('id, status, requested_at, requested_by, organizations(name)')
        .eq('id', requestId)
        .maybeSingle()
      if (!row) return json({ error: 'Request not found' }, 404)
      const { data: requester } = await admin.auth.admin.getUserById(row.requested_by)
      return json({
        id: row.id,
        status: row.status,
        requestedAt: row.requested_at,
        orgName: (row as any).organizations?.name ?? null,
        requesterEmail: requester?.user?.email ?? null,
      })
    }

    // Look up plans before claiming, so a missing plan can't strand a request
    let freePlanId: string | undefined
    let proPlanId: string | undefined
    if (action === 'approve') {
      const { data: plans } = await admin
        .from('plans')
        .select('id, name')
        .in('name', ['free', 'pro'])
      freePlanId = plans?.find((p) => p.name === 'free')?.id
      proPlanId = plans?.find((p) => p.name === 'pro')?.id
      if (!freePlanId || !proPlanId) throw new Error('Free or Pro plan row is missing')
    }

    // Claim the request atomically so it can only be decided once
    const { data: claimed } = await admin
      .from('trial_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'denied',
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id, org_id, requested_by')
      .maybeSingle()
    if (!claimed) return json({ error: 'Request not found or already decided' }, 409)

    const { data: requester } = await admin.auth.admin.getUserById(claimed.requested_by)
    const to = requester?.user?.email

    if (action === 'deny') {
      if (to) {
        await sendEmail(
          to,
          'Your Pro trial request',
          `<p>Thanks for your interest in Pro. We weren't able to approve a trial at this time.
           Please contact us if you have questions.</p>`
        ).catch((e) => console.error('Deny email failed:', e))
      }
      return json({ ok: true, status: 'denied' })
    }

    // Approve: move the subscription to Pro for TRIAL_DAYS
    const ends = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    const { data: updatedSub } = await admin
      .from('org_subscriptions')
      .update({
        plan_id: proPlanId,
        trial_ends_at: ends.toISOString(),
        trial_used: true,
        trial_warning_sent_at: null,
      })
      .eq('org_id', claimed.org_id)
      .eq('plan_id', freePlanId!)
      .eq('trial_used', false)
      .select('id')
      .maybeSingle()

    if (!updatedSub) {
      // Put the request back so it isn't lost
      await admin
        .from('trial_requests')
        .update({ status: 'pending', decided_at: null, decided_by: null })
        .eq('id', requestId)
      return json({ error: 'Could not activate trial (not on Free, or trial already used)' }, 409)
    }

    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', claimed.org_id)
      .single()

    const endsLabel = ends.toLocaleDateString('en-CA', {
      timeZone: 'America/Edmonton',
      dateStyle: 'long',
    })

    let emailSent = true
    if (to) {
      try {
        await sendEmail(
          to,
          'You have been upgraded to Pro for 15 days',
          `<p>Good news: <strong>${esc(org?.name ?? 'your organization')}</strong> has been upgraded
           to <strong>Pro</strong> for ${TRIAL_DAYS} days.</p>
           <p>Your trial runs until <strong>${endsLabel}</strong>. We'll remind you 3 days before it ends.
           After that your account returns to the Free version unless you subscribe to keep Pro.</p>`
        )
      } catch (e) {
        emailSent = false
        console.error('Approval email failed:', e)
      }
    }

    return json({ ok: true, status: 'approved', trialEndsAt: ends.toISOString(), emailSent })
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong' }, 500)
  }
})