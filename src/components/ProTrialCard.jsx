// src/components/ProTrialCard.jsx
//
// Two things, both hidden when they don't apply:
//   - A "days left" banner on every page while a Pro trial is running.
//   - An "Apply for a free Pro trial" card on the dashboard ('/') for Free orgs
//     that haven't used a trial. The apply call goes to the request-pro-trial
//     Edge Function, which enforces owner-only / one trial per org server-side.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const DAY_MS = 24 * 60 * 60 * 1000

export default function ProTrialCard() {
  const { activeOrg } = useOrg()
  const location = useLocation()
  const orgId = activeOrg?.orgId

  const [sub, setSub] = useState(null)
  const [latestRequest, setLatestRequest] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId) {
      setSub(null)
      setLatestRequest(null)
      return
    }
    let cancelled = false

    async function load() {
      const [{ data: subData }, { data: reqData }] = await Promise.all([
        supabase
          .from('org_subscriptions')
          .select('trial_ends_at, trial_used, plan:plan_id(name)')
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase
          .from('trial_requests')
          .select('status')
          .eq('org_id', orgId)
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (cancelled) return
      setSub(subData || null)
      setLatestRequest(reqData || null)
    }

    load()
    return () => { cancelled = true }
  }, [orgId])

  async function requestTrial() {
    setSubmitting(true)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('request-pro-trial', {
        body: { orgId },
      })
      if (fnErr) {
        let msg = fnErr.message
        try {
          const body = await fnErr.context.json()
          if (body?.error) msg = body.error
        } catch { /* keep the default message */ }
        throw new Error(msg)
      }
      setLatestRequest({ status: 'pending' })
    } catch (e) {
      setError(e.message || 'Could not submit your request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!orgId || !sub) return null

  const planName = sub.plan?.name
  const endsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null
  const trialActive = planName === 'pro' && endsAt && endsAt.getTime() > Date.now()

  const box = {
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: 12,
    padding: '14px 18px',
    marginBottom: 16,
    fontSize: 14,
  }

  // ── Active trial banner (all pages) ──────────────────────────────────────
  if (trialActive) {
    const daysLeft = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / DAY_MS))
    const endsLabel = endsAt.toLocaleDateString('en-CA', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const urgent = daysLeft <= 3
    return (
      <div style={{
        ...box,
        background: urgent ? '#fef3c7' : '#e8f5f5',
        border: `1px solid ${urgent ? '#fde68a' : '#b2e0e2'}`,
        color: urgent ? '#92400e' : '#0d7377',
      }}>
        <strong>Pro trial:</strong> {daysLeft} day{daysLeft === 1 ? '' : 's'} left (ends {endsLabel}).
        {' '}To keep Pro after that, contact us before the trial ends; otherwise your account returns to the Free version.
      </div>
    )
  }

  // ── Apply card (dashboard only, Free orgs only) ──────────────────────────
  if (location.pathname !== '/' || planName !== 'free' || sub.trial_used) return null

  const status = latestRequest?.status

  if (status === 'pending') {
    return (
      <div style={{ ...box, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
        Your Pro trial request is waiting for approval. We'll email you as soon as it's reviewed.
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div style={{ ...box, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
        Your Pro trial request wasn't approved. Please contact us if you have questions.
      </div>
    )
  }

  return (
    <div style={{
      ...box,
      background: 'white',
      border: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontWeight: 700, color: '#1e293b' }}>Try Pro free for 15 days</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
          Unlock every Pro feature. Requests are reviewed, and we'll email you when yours is approved.
        </div>
        {error && <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 6 }}>⚠ {error}</div>}
      </div>
      <button
        onClick={requestTrial}
        disabled={submitting}
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          padding: '10px 20px',
          borderRadius: 8,
          border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.55 : 1,
          background: '#0d7377',
          color: 'white',
          whiteSpace: 'nowrap',
        }}
      >
        {submitting ? 'Sending…' : 'Apply for free trial'}
      </button>
    </div>
  )
}