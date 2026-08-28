// src/pages/Onboarding.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { checkCanCreateOrg } from '../utils/planLimits'

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
  }, [])

  
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
      if (!allowed) return setError(reason)

      const { data, error: fnErr } = await supabase
        .rpc('create_organization', { org_name: name, plan_id: selectedPlanId })
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

          <button
            className="onboarding-btn"
            onClick={handleCreate}
            disabled={saving || !orgName.trim() || !selectedPlanId}
          >
            {saving ? 'Creating…' : 'Create Organization →'}
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