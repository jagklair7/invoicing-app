// src/pages/admin/TrialRequests.jsx
//
// Super-admin queue for Pro trial requests. Reads trial_requests directly
// (the "Super admins can manage trial requests" policy allows it) and sends
// approve/deny through the decide-pro-trial Edge Function, which checks
// profiles.is_super_admin again server-side and emails the customer.
import { useEffect, useState } from 'react'
import { supabase } from '../../app/supabaseClient'

const css = `
  .trials-root {
    max-width: 860px;
    margin: 0 auto;
    font-family: 'DM Sans', sans-serif;
    padding: 28px 0 60px;
  }
  .trials-title { font-size: 22px; font-weight: 700; color: #1e293b; margin: 0; }
  .trials-sub { font-size: 13px; color: #94a3b8; margin: 4px 0 24px; }
  .trials-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 24px;
  }
  .trials-card-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0d7377;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f1f5f9;
  }
  .trials-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #f1f5f9;
    flex-wrap: wrap;
  }
  .trials-row:last-child { border-bottom: none; }
  .trials-org { font-size: 14px; font-weight: 600; color: #1e293b; }
  .trials-meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .trials-actions { display: flex; gap: 8px; }
  .trials-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
  }
  .trials-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .trials-btn--approve { background: #0d7377; color: white; }
  .trials-btn--approve:hover:not(:disabled) { background: #14a0a5; }
  .trials-btn--deny { background: #fff5f5; color: #e53e3e; border: 1px solid #fecaca; }
  .trials-btn--deny:hover:not(:disabled) { background: #fee2e2; }
  .trials-pill {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 20px;
    background: #f1f5f9;
    color: #64748b;
  }
  .trials-pill--approved { background: #e8f5f5; color: #0d7377; }
  .trials-pill--denied { background: #fef2f2; color: #ef4444; }
  .trials-msg { border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
  .trials-msg--ok { background: #e8f5f5; border: 1px solid #b2e0e2; color: #0d7377; }
  .trials-msg--warn { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; }
  .trials-msg--error { background: #fef2f2; border: 1px solid #fecaca; color: #e53e3e; }
  .trials-empty { font-size: 13px; color: #94a3b8; padding: 8px 0; }
  .trials-spinner {
    width: 24px; height: 24px;
    border: 2px solid #e2e8f0;
    border-top-color: #0d7377;
    border-radius: 50%;
    animation: trials-spin .7s linear infinite;
    margin: 40px auto;
  }
  @keyframes trials-spin { to { transform: rotate(360deg); } }
`

export default function TrialRequests() {
  const [rows, setRows] = useState([])
  const [emails, setEmails] = useState({}) // user id -> email
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [message, setMessage] = useState(null) // { type: 'ok' | 'warn' | 'error', text }

  useEffect(() => {
    fetchRequests()
  }, [])

  async function fetchRequests() {
    setLoading(true)
    const { data, error } = await supabase
      .from('trial_requests')
      .select('id, org_id, requested_by, status, requested_at, decided_at, organizations(name)')
      .order('requested_at', { ascending: false })
      .limit(50)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
      return
    }

    setRows(data || [])

    const ids = [...new Set((data || []).map(r => r.requested_by))]
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', ids)
      setEmails(Object.fromEntries((profiles || []).map(p => [p.id, p.email])))
    }
    setLoading(false)
  }

  async function decide(row, action) {
    const orgName = row.organizations?.name || 'this organization'
    const prompt = action === 'approve'
      ? `Approve a 15-day Pro trial for "${orgName}"? They'll be upgraded to Pro immediately and emailed.`
      : `Deny the Pro trial request from "${orgName}"? They'll be emailed.`
    if (!window.confirm(prompt)) return

    setBusy(prev => ({ ...prev, [row.id]: true }))
    setMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke('decide-pro-trial', {
        body: { requestId: row.id, action },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await error.context.json()
          if (body?.error) msg = body.error
        } catch { /* keep the default message */ }
        throw new Error(msg)
      }

      if (action === 'approve') {
        setMessage(data?.emailSent === false
          ? { type: 'warn', text: `${orgName} is now on a 15-day Pro trial, but the notification email failed. Let them know yourself.` }
          : { type: 'ok', text: `${orgName} is now on a 15-day Pro trial and has been emailed.` })
      } else {
        setMessage({ type: 'ok', text: `Request from ${orgName} denied.` })
      }
      await fetchRequests()
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Something went wrong.' })
    } finally {
      setBusy(prev => ({ ...prev, [row.id]: false }))
    }
  }

  const fmtDate = d => new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
  const pending = rows.filter(r => r.status === 'pending')
  const decided = rows.filter(r => r.status !== 'pending')

  return (
    <>
      <style>{css}</style>
      <div className="trials-root">
        <h1 className="trials-title">Pro Trial Requests</h1>
        <p className="trials-sub">Approve or deny 15-day Pro trials. The customer is emailed either way.</p>

        {message && <div className={`trials-msg trials-msg--${message.type}`}>{message.text}</div>}

        {loading ? (
          <div className="trials-spinner" />
        ) : (
          <>
            <div className="trials-card">
              <div className="trials-card-title">Waiting for approval ({pending.length})</div>
              {pending.length === 0 && <div className="trials-empty">No pending requests.</div>}
              {pending.map(r => (
                <div key={r.id} className="trials-row">
                  <div>
                    <div className="trials-org">{r.organizations?.name || 'Unknown organization'}</div>
                    <div className="trials-meta">
                      {emails[r.requested_by] || 'unknown user'} · requested {fmtDate(r.requested_at)}
                    </div>
                  </div>
                  <div className="trials-actions">
                    <button
                      className="trials-btn trials-btn--approve"
                      onClick={() => decide(r, 'approve')}
                      disabled={busy[r.id]}
                    >
                      {busy[r.id] ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      className="trials-btn trials-btn--deny"
                      onClick={() => decide(r, 'deny')}
                      disabled={busy[r.id]}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {decided.length > 0 && (
              <div className="trials-card">
                <div className="trials-card-title">Recent decisions</div>
                {decided.map(r => (
                  <div key={r.id} className="trials-row">
                    <div>
                      <div className="trials-org">{r.organizations?.name || 'Unknown organization'}</div>
                      <div className="trials-meta">
                        {emails[r.requested_by] || 'unknown user'} · decided {r.decided_at ? fmtDate(r.decided_at) : '—'}
                      </div>
                    </div>
                    <span className={`trials-pill trials-pill--${r.status}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}