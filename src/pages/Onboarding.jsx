// src/pages/Onboarding.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { checkCanCreateOrg } from '../utils/planLimits'
import { useHelcimPay } from '../hooks/useHelcimPay'

const css = `
.onboarding-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  font-family: 'DM Sans', sans-serif;
  padding: 24px;
}

.onboarding-card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  padding: 48px 40px;
  width: 100%;
  max-width: 560px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

.onboarding-logo {
  width: 40px;
  height: 40px;
  background: #0d7377;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin-bottom: 24px;
}

.onboarding-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

.onboarding-sub {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 32px;
  line-height: 1.5;
}

.onboarding-resume {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 24px;
}

.onboarding-resume-title {
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
  margin-bottom: 4px;
}

.onboarding-resume-body {
  font-size: 13px;
  color: #78350f;
  line-height: 1.5;
  margin-bottom: 12px;
}

.onboarding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.onboarding-field label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.onboarding-input {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  outline: none;
  transition: border 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.onboarding-input:focus {
  border-color: #0d7377;
  background: #fff;
}

.onboarding-plans-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 10px;
}

.onboarding-plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 24px;
}

.onboarding-plan-card {
  padding: 14px 12px;
  border-radius: 10px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}

.onboarding-plan-card:hover {
  border-color: #b2e0e2;
}

.onboarding-plan-card--selected {
  background: #0d7377;
  border-color: #0d7377;
}

.onboarding-plan-name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.onboarding-plan-card--selected .onboarding-plan-name { color: #fff; }

.onboarding-plan-price {
  font-size: 12px;
  color: #475569;
  margin-bottom: 10px;
}

.onboarding-plan-card--selected .onboarding-plan-price { color: rgba(255,255,255,0.85); }

.onboarding-plan-feature {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 3px;
}

.onboarding-plan-card--selected .onboarding-plan-feature { color: rgba(255,255,255,0.75); }

.onboarding-plans-loading {
  font-size: 13px;
  color: #94a3b8;
  padding: 12px 0;
  margin-bottom: 16px;
}

.onboarding-btn {
  width: 100%;
  padding: 12px;
  background: #0d7377;
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s;
}

.onboarding-btn:hover:not(:disabled) { background: #0a5f63; }
.onboarding-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.onboarding-btn--secondary {
  background: #d97706;
}
.onboarding-btn--secondary:hover:not(:disabled) { background: #b45309; }

.onboarding-error {
  font-size: 13px;
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}

.onboarding-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 24px 0;
}

.onboarding-signin {
  font-size: 13px;
  color: #64748b;
  text-align: center;
}

.onboarding-signin button {
  background: none;
  border: none;
  color: #0d7377;
  font-weight: 600;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  padding: 0;
}
`

export default function Onboarding() {
  const [orgName,  setOrgName]  = useState('')
  const [plans, setPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [pendingPayment, setPendingPayment] = useState(null) // row from pending_org_payments, or null
  const [resuming, setResuming] = useState(false)
  const { refresh } = useOrg()
  const navigate    = useNavigate()

    useEffect(() => {
    const fetchPlans = async () => {
      const { data, error: plansErr } = await supabase
        .from('plans')
        .select('*')
        .order('price_monthly', { ascending: true })
      if (!plansErr && data) {
        setPlans(data)
        const free = data.find(p => p.name === 'free')
        setSelectedPlanId(free?.id || data[0]?.id || null)
      }
      setLoadingPlans(false)
    }
    fetchPlans()
    checkForPendingPayment()
  }, [])

  // If a previous session's payment succeeded but org creation didn't
  // finish, this surfaces it so the user can resume without paying again.
  async function checkForPendingPayment() {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id
    if (!userId) return

    const { data } = await supabase
      .from('pending_org_payments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) setPendingPayment(data)
  }

  async function resolvePendingPayment(pendingPaymentId) {
    const { data, error: resolveErr } = await supabase
      .rpc('resolve_pending_org_payment', { pending_payment_id: pendingPaymentId })
    if (resolveErr) throw resolveErr

    const org = typeof data === 'string' ? JSON.parse(data) : data
    localStorage.setItem('activeOrgId', org.id)
    await refresh()
    navigate('/', { replace: true })
  }

  async function handleResume() {
    if (!pendingPayment) return
    setResuming(true)
    setError('')
    try {
      await resolvePendingPayment(pendingPayment.id)
    } catch (err) {
      setError(
        err.message ||
        'Still unable to finish setting up your organization. Your payment is safely on file — try again in a moment, or contact support.'
      )
      setResuming(false)
    }
  }

  const GST_RATE = 0.05

  function calcGst(basePrice) {
    return Math.round(basePrice * GST_RATE * 100) / 100
  }
  function calcTotal(basePrice) {
    return Math.round(basePrice * (1 + GST_RATE) * 100) / 100
  }
  
  const selectedPlan = plans.find(p => p.id === selectedPlanId) || null
  const baseAmount = selectedPlan?.price_monthly || 0
  const gstAmount = calcGst(baseAmount)
  const totalAmount = calcTotal(baseAmount)

  async function finishCreateOrg() {
    try {
      const { data, error: fnErr } = await supabase
        .rpc('create_organization', {
          org_name: orgName.trim(),
          plan_id: selectedPlanId,
          helcim_transaction_id: null,
        })
      if (fnErr) throw fnErr

      const org = typeof data === 'string' ? JSON.parse(data) : data
      localStorage.setItem('activeOrgId', org.id)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // NOTE: `txn?.transactionId` is an assumed field name for HelcimPay.js's
  // SUCCESS payload — verify against a real console.log(txn) during testing.
  async function handlePaymentSuccess(txn) {
    const transactionId = txn?.transactionId ?? txn?.data?.transactionId ?? null
    if (!transactionId) {
      console.warn('Helcim payment succeeded but no transactionId was found on the payload:', txn)
      setError('Payment succeeded but we could not read the transaction reference. Contact support — do not pay again.')
      setSaving(false)
      return
    }

    try {
      // Record the successful payment FIRST, as its own simple insert,
      // before attempting the multi-table org creation. If org creation
      // fails after this point, the payment is never lost — it just sits
      // here as resumable.
      const { data: userData } = await supabase.auth.getUser()
      const { data: pending, error: insertErr } = await supabase
        .from('pending_org_payments')
        .insert({
          user_id: userData.user.id,
          org_name: orgName.trim(),
          plan_id: selectedPlanId,
          helcim_transaction_id: String(transactionId),
          amount: totalAmount,
          base_amount: baseAmount,
          gst_amount: gstAmount,
        })
        .select()
        .single()

      if (insertErr) {
        // This is the one remaining gap: if even this simple insert fails,
        // the payment genuinely isn't recorded anywhere. Surface the
        // transaction id directly so support can act on it manually.
        setError(
          `Payment succeeded (transaction ${transactionId}) but we could not save that to your account. ` +
          `Contact support with this transaction ID — do not pay again.`
        )
        setSaving(false)
        return
      }

      await resolvePendingPayment(pending.id)

    } catch (err) {
      // Payment is safely recorded in pending_org_payments even though
      // this attempt to finish org creation failed — resume is available.
      setPendingPayment(prev => prev)
      await checkForPendingPayment()
      setError(
        err.message ||
        'Payment succeeded but we hit an error finishing setup. Your payment is on file — click "Resume setup" below to try again.'
      )
      setSaving(false)
    }
  }

  function handlePaymentError(msg) {
    setError(msg || 'Payment failed. Your organization was not created.')
    setSaving(false)
  }

  const { openPayment: openHelcimPayment } = useHelcimPay({
    amount: selectedPlan?.price_monthly || 0,
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  })

  async function handleCreate() {
    const name = orgName.trim()
    if (!name) return setError('Please enter an organization name.')
    if (!selectedPlanId) return setError('Please select a plan.')
    setSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { allowed, reason } = await checkCanCreateOrg(userId)
      if (!allowed) {
        setSaving(false)
        return setError(reason)
      }

      if (selectedPlan && selectedPlan.price_monthly > 0) {
        openHelcimPayment()
        return
      }

      await finishCreateOrg()

    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const fmtPrice = (n) => n === 0 ? 'Free' : `$${n}/mo`
  const fmtLimit = (n, label) => n === -1 ? `Unlimited ${label}` : `${n} ${label}`

  return (
    <>
      <style>{css}</style>
      <div className="onboarding-wrap">
        <div className="onboarding-card">
          <div className="onboarding-logo">🏢</div>
          <h1 className="onboarding-title">Create your organization</h1>
          <p className="onboarding-sub">
            You're almost in! Set up your organization to get started.
            You can always change this later in Settings.
          </p>

          {pendingPayment && (
            <div className="onboarding-resume">
              <div className="onboarding-resume-title">Payment already received</div>
              <div className="onboarding-resume-body">
                We received your payment for "{pendingPayment.org_name}" but didn't finish setting up
                your organization. Click below to finish — you won't be charged again.
              </div>
              <button
                className="onboarding-btn onboarding-btn--secondary"
                style={{ marginTop: 0 }}
                onClick={handleResume}
                disabled={resuming}
              >
                {resuming ? 'Finishing setup…' : 'Resume setup →'}
              </button>
            </div>
          )}

          {error && <div className="onboarding-error">{error}</div>}

          <div className="onboarding-field">
            <label>Organization Name</label>
            <input
              className="onboarding-input"
              type="text"
              placeholder="e.g. Acme Corp"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="onboarding-plans-label">Choose a plan</div>

          {loadingPlans ? (
            <div className="onboarding-plans-loading">Loading plans…</div>
          ) : (
            <div className="onboarding-plans-grid">
              {plans.map(p => (
                <div
                  key={p.id}
                  className={`onboarding-plan-card${selectedPlanId === p.id ? ' onboarding-plan-card--selected' : ''}`}
                  onClick={() => setSelectedPlanId(p.id)}
                >
                  <div className="onboarding-plan-name">
                    {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                  </div>
                  <div className="onboarding-plan-price">{fmtPrice(p.price_monthly)}</div>
                  <div className="onboarding-plan-feature">{fmtLimit(p.max_employees, 'employees')}</div>
                  <div className="onboarding-plan-feature">{fmtLimit(p.max_invoices, 'invoices')}</div>
                  <div className="onboarding-plan-feature">{fmtLimit(p.max_orgs, 'orgs')}</div>
                </div>
              ))}
            </div>
          )}

          {selectedPlan && selectedPlan.price_monthly > 0 && (
            <p style={{ fontSize: 12, color: '#64748b', marginTop: -14, marginBottom: 20 }}>
              {selectedPlan && selectedPlan.price_monthly > 0 && (
                <div style={{
                  fontSize: 13, color: '#475569', marginTop: -8, marginBottom: 20,
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal</span><span>${baseAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                    <span>GST (5%)</span><span>${gstAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a', marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                    <span>Total (charged monthly)</span><span>${totalAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                    Refundable within 15 days.
                  </div>
                </div>
              )}
            </p>
          )}

          <button
            className="onboarding-btn"
            onClick={handleCreate}
            disabled={saving || resuming || !orgName.trim() || !selectedPlanId}
          >
            {saving
              ? (selectedPlan?.price_monthly > 0 ? 'Processing payment…' : 'Creating…')
              : (selectedPlan?.price_monthly > 0 ? `Continue to payment (${totalAmount.toFixed(2)}) →` : 'Create Organization →')}
          </button>

          <div className="onboarding-divider" />

          <div className="onboarding-signin">
            Wrong account?{' '}
            <button onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  )
}