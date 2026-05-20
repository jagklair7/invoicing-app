import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../app/supabaseClient'
import { useOrg } from '../../context/OrgContext'

const css = `
.seed-wrap {
  font-family: 'DM Sans', sans-serif;
  max-width: 740px;
  margin: 0 auto;
  padding: 40px 24px;
}
.seed-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 32px;
}
.seed-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 12px;
}
.seed-copy {
  font-size: 14px;
  color: #475569;
  line-height: 1.8;
  margin-bottom: 24px;
}
.seed-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border-radius: 10px;
  border: none;
  background: #0d7377;
  color: white;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.seed-button:hover { background: #14a0a5; }
.seed-button:disabled { opacity: 0.65; cursor: not-allowed; }
.seed-note {
  margin-top: 16px;
  font-size: 13px;
  color: #64748b;
}
.seed-success {
  margin-top: 18px;
  color: #0d7377;
  font-weight: 600;
}
.seed-error {
  margin-top: 18px;
  color: #dc2626;
  font-weight: 600;
}
.seed-back {
  margin-top: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #0d7377;
  cursor: pointer;
  font-weight: 700;
}
`

export default function SeedPlans() {
  const navigate = useNavigate()
  const { isSuperAdmin, loading } = useOrg()
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      navigate('/')
      return
    }
    fetchPlans()
  }, [isSuperAdmin, loading, navigate])

  async function fetchPlans() {
    setLoadingPlans(true)
    const { data } = await supabase.from('plans').select('id, name')
    setPlans(data || [])
    setLoadingPlans(false)
  }

  async function handleSeedPlans() {
    setSaving(true)
    setMessage('')
    setError('')

    const defaultPlans = [
      {
        name: 'free',
        price_monthly: 0,
        price_annual: 0,
        max_employees: 0,
        max_invoices: 5,
        max_orgs: 1,
        features: { payroll: false, pay_stub_pdf: false, ytd: false, t4: false, multi_org: false },
      },
      {
        name: 'starter',
        price_monthly: 29,
        price_annual: 290,
        max_employees: 5,
        max_invoices: 50,
        max_orgs: 1,
        features: { payroll: true, pay_stub_pdf: true, ytd: false, t4: false, multi_org: false },
      },
      {
        name: 'pro',
        price_monthly: 79,
        price_annual: 790,
        max_employees: 25,
        max_invoices: -1,
        max_orgs: 5,
        features: { payroll: true, pay_stub_pdf: true, ytd: true, t4: false, multi_org: true },
      },
      {
        name: 'enterprise',
        price_monthly: 199,
        price_annual: 1990,
        max_employees: -1,
        max_invoices: -1,
        max_orgs: -1,
        features: { payroll: true, pay_stub_pdf: true, ytd: true, t4: true, multi_org: true },
      },
    ]

    const { error } = await supabase.from('plans').insert(defaultPlans, { returning: 'minimal' })
    if (error) {
      setError(error.message || 'Unable to create default plans.')
    } else {
      setMessage('Default plans created successfully. Return to the Plans tab to review them.')
      await fetchPlans()
    }
    setSaving(false)
  }

  if (loading || loadingPlans) {
    return <div style={{ padding: 40, fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>
  }

  return (
    <>
      <style>{css}</style>
      <div className="seed-wrap">
        <div className="seed-card">
          <h1 className="seed-title">Create Default Plan Tiers</h1>
          <p className="seed-copy">
            This page seeds the standard pricing plans used by the app. If your admin Plans tab is empty, create the default tiers here and then return to the Admin Panel.
          </p>

          <button
            className="seed-button"
            onClick={handleSeedPlans}
            disabled={saving || plans.length > 0}
          >
            {plans.length > 0 ? 'Default plans already exist' : saving ? 'Creating default plans…' : 'Create default plan tiers'}
          </button>

          {message && <div className="seed-success">{message}</div>}
          {error && <div className="seed-error">{error}</div>}

          <p className="seed-note">
            {plans.length > 0
              ? 'The default plan tiers are already present in the database. You can now go back to the admin Plans tab.'
              : 'This operation is safe to run once. If plans already exist, the button will be disabled.'}
          </p>

          <button className="seed-back" onClick={() => navigate('/admin')}>
            ← Back to Admin Panel
          </button>
        </div>
      </div>
    </>
  )
}
