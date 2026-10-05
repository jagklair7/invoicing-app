// api/cron/trial-lifecycle.js
//
// Vercel Cron endpoint — runs daily (see vercel.json).
//   1. Downgrades expired, unpaid Pro trials back to Free via the
//      expire_pro_trials() database function.
//   2. Drops custom plans to Free once their grace period (7 days after
//      current_period_end) has passed, via expire_lapsed_custom_plans().
//   3. Sends the "renewal due in 7 days" reminder to the owner for custom plans
//      by invoking the send-renewal-reminder Edge Function.
//   4. Sends the "trial ends in 3 days" warning by invoking the
//      send-trial-warning Edge Function (same pattern as
//      generate-recurring-invoices.js invoking send-invoice).
//   5. Sends the "trial has ended" email for trials downgraded in the last
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
const RENEWAL_REMINDER_DAYS = 7

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const results = {
    expired: 0,
    customLapsed: 0,
    renewalReminders: 0,
    warned: 0,
    endedNotified: 0,
    errors: [],
  }

  // 1. Expire lapsed trials
  const { data: expiredCount, error: expireErr } = await supabase.rpc('expire_pro_trials')
  if (expireErr) {
    results.errors.push({ stage: 'expire', message: expireErr.message })
  } else {
    results.expired = expiredCount ?? 0
  }

  // 2. Drop custom plans past their 7-day grace period to Free
  const { data: lapsedCount, error: lapsedErr } = await supabase.rpc('expire_lapsed_custom_plans')
  if (lapsedErr) {
    results.errors.push({ stage: 'custom-lapse', message: lapsedErr.message })
  } else {
    results.customLapsed = lapsedCount ?? 0
  }

  const now = new Date()

  // 3. Renewal reminders for custom plans ending within RENEWAL_REMINDER_DAYS
  //    (still-custom orgs only: ones already dropped to Free are excluded by the is_custom filter)
  const remindBy = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000)

  const { data: dueRenewals, error: renewalErr } = await supabase
    .from('org_subscriptions')
    .select('org_id, current_period_end, renewal_reminder_for, plans!inner(is_custom)')
    .eq('plans.is_custom', true)
    .eq('status', 'active')
    .not('current_period_end', 'is', null)
    .lte('current_period_end', remindBy.toISOString())

  if (renewalErr) {
    results.errors.push({ stage: 'renewal-query', message: renewalErr.message })
  } else {
    const pending = (dueRenewals ?? []).filter(
      (s) =>
        !s.renewal_reminder_for ||
        new Date(s.renewal_reminder_for).getTime() !== new Date(s.current_period_end).getTime()
    )
    for (const sub of pending) {
      try {
        const { data, error: sendErr } = await supabase.functions.invoke('send-renewal-reminder', {
          body: { orgId: sub.org_id },
        })
        if (sendErr) throw sendErr
        if (data?.sent) results.renewalReminders += 1
      } catch (e) {
        results.errors.push({ orgId: sub.org_id, stage: 'renewal', message: e.message })
      }
    }
  }

  // 4. Warnings for trials ending within WARNING_DAYS
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

  // 5. "Trial has ended" emails (new downgrades plus retries)
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