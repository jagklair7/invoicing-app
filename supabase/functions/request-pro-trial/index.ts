import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const { orgId } = await req.json()
    if (!orgId) return json({ error: 'orgId is required' }, 400)

    // Only the org owner may apply
    const { data: membership } = await admin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return json({ error: 'Not a member of this organization' }, 403)
    if (membership.role !== 'owner') {
      return json({ error: 'Only the organization owner can request a trial' }, 403)
    }

    const { data: suspended } = await admin.rpc('is_org_suspended', { check_org_id: orgId })
    if (suspended) return json({ error: 'This organization is suspended' }, 403)

    const { data: plans } = await admin
      .from('plans')
      .select('id, name')
      .in('name', ['free', 'pro'])
    const freePlan = plans?.find((p) => p.name === 'free')
    const proPlan = plans?.find((p) => p.name === 'pro')
    if (!freePlan || !proPlan) throw new Error('Free or Pro plan row is missing')

    const { data: sub } = await admin
      .from('org_subscriptions')
      .select('id, plan_id, trial_used')
      .eq('org_id', orgId)
      .maybeSingle()
    if (!sub) return json({ error: 'No subscription found for this organization' }, 404)
    if (sub.trial_used) {
      return json({ error: 'This organization has already used its free trial' }, 409)
    }
    if (sub.plan_id !== freePlan.id) {
      return json({ error: 'Only Free organizations can request a Pro trial' }, 409)
    }

    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()

    const { data: request, error: insertErr } = await admin
      .from('trial_requests')
      .insert({ org_id: orgId, requested_by: user.id })
      .select('id')
      .single()
    if (insertErr) {
      if (insertErr.code === '23505') {
        return json({ error: 'A trial request is already pending' }, 409)
      }
      throw insertErr
    }

    let emailSent = true
    try {
      const reviewUrl = `${Deno.env.get('APP_URL')}/platform-admin/trials?request=${request.id}`
      await sendEmail(
        Deno.env.get('TRIAL_ADMIN_EMAIL')!,
        `Pro trial request: ${org?.name ?? 'Unknown organization'}`,
        `<p><strong>${esc(org?.name ?? 'Unknown organization')}</strong> has requested a 15-day Pro trial.</p>
         <p>Requested by: ${esc(user.email ?? 'unknown')}</p>
         <p><a href="${reviewUrl}">Review and approve or deny</a> (login required)</p>`
      )
    } catch (e) {
      emailSent = false
      console.error('Admin notification failed:', e)
    }

    return json({ ok: true, requestId: request.id, emailSent })
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong' }, 500)
  }
})