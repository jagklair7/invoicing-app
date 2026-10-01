// api/cron/trial-lifecycle.js
//
// Vercel Cron endpoint — runs daily (see vercel.json).
//   1. Downgrades expired, unpaid Pro trials back to Free via the
//      expire_pro_trials() database function.
//   2. Sends the "trial ends in 3 days" warning by invoking the
//      send-trial-warning Edge Function (same pattern as
//      generate-recurring-invoices.js invoking send-invoice).
//   3. Sends the "trial has ended" email for trials downgraded in the last
//      3 days that haven't been notified yet (also retries earlier failures)
//      by invoking the send-trial-ended Edge Function.
//
// Expiry runs first so an org that just lapsed never gets a "3 days left" email.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const WARNING_DAYS = 3
const ENDED_NOTICE_DAYS = 3

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const results = { expired: 0, warned: 0, endedNotified: 0, errors: [] }

  // 1. Expire lapsed trials
  const { data: expiredCount, error: expireErr } = await supabase.rpc('expire_pro_trials')
  if (expireErr) {
    results.errors.push({ stage: 'expire', message: expireErr.message })
  } else {
    results.expired = expiredCount ?? 0
  }

  const now = new Date()

  // 2. Warnings for trials ending within WARNING_DAYS
  const warnBy = new Date(now.getTime() + WARNING_DAYS * 24 * 60 * 60 * 1000)

  const { data: dueWarnings, error: warnErr } = await supabase
    .from('org_subscriptions')
    .select('org_id')
    .not('trial_ends_at', 'is', null)
    .gt('trial_ends_at', now.toISOString())
    .lte('trial_ends_at', warnBy.toISOString())
    .is('trial_warning_sent_at', null)
    .is('helcim_transaction_id', null)

  if (warnErr) {
    return res.status(500).json({ ...results, error: warnErr.message })
  }

  for (const sub of dueWarnings ?? []) {
    try {
      const { error: sendErr } = await supabase.functions.invoke('send-trial-warning', {
        body: { orgId: sub.org_id },
      })
      if (sendErr) throw sendErr
      results.warned += 1
    } catch (e) {
      results.errors.push({ orgId: sub.org_id, stage: 'warn', message: e.message })
    }
  }

  // 3. "Trial has ended" emails (new downgrades plus retries)
  const endedSince = new Date(now.getTime() - ENDED_NOTICE_DAYS * 24 * 60 * 60 * 1000)

  const { data: dueEnded, error: endedErr } = await supabase
    .from('org_subscriptions')
    .select('org_id')
    .not('trial_ended_at', 'is', null)
    .gt('trial_ended_at', endedSince.toISOString())
    .is('trial_ended_email_sent_at', null)

  if (endedErr) {
    results.errors.push({ stage: 'ended-query', message: endedErr.message })
  } else {
    for (const sub of dueEnded ?? []) {
      try {
        const { data, error: sendErr } = await supabase.functions.invoke('send-trial-ended', {
          body: { orgId: sub.org_id },
        })
        if (sendErr) throw sendErr
        if (data?.sent) results.endedNotified += 1
      } catch (e) {
        results.errors.push({ orgId: sub.org_id, stage: 'ended', message: e.message })
      }
    }
  }

  return res.status(200).json(results)
}