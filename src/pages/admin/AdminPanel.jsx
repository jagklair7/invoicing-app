// src/pages/admin/AdminPanel.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../app/supabaseClient'
import { useOrg } from '../../context/OrgContext'
import { useNavigate } from 'react-router-dom'

const css = `
.admin-wrap {
  font-family: 'DM Sans', sans-serif;
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 24px;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.admin-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.admin-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
  background: #0d7377;
  border-radius: 6px;
  padding: 4px 10px;
}

.admin-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #e2e8f0;
  margin-bottom: 32px;
}

.admin-tab {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  background: none;
  border: none;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
}

.admin-tab:hover { color: #0d7377; }
.admin-tab--active {
  color: #0d7377;
  font-weight: 600;
  border-bottom-color: #0d7377;
}

.admin-plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.admin-plan-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 20px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s, background 0.2s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-plan-card:hover {
  transform: translateY(-2px);
  border-color: #0d7377;
}

.admin-plan-card--selected {
  background: #0d7377;
  border-color: #0d7377;
  color: white;
}

.admin-plan-card--selected .admin-plan-card-price,
.admin-plan-card--selected .admin-plan-card-meta {
  color: rgba(255,255,255,0.85);
}

.admin-plan-card-title {
  font-size: 18px;
  font-weight: 700;
  text-transform: capitalize;
}

.admin-plan-card-price {
  font-size: 14px;
  color: #475569;
  line-height: 1.4;
}

.admin-plan-card-meta {
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}

.admin-package-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.admin-package-option-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 18px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-package-option-card h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.admin-package-option-card p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.admin-section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
  margin: 0 0 16px;
}

.admin-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
}

.admin-flag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  gap: 12px;
}

.admin-flag-row:last-child { border-bottom: none; }

.admin-flag-info { flex: 1; min-width: 0; }

.admin-flag-label {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 2px;
}

.admin-flag-key {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.admin-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.admin-toggle input { opacity: 0; width: 0; height: 0; }

.admin-toggle-slider {
  position: absolute;
  inset: 0;
  background: #e2e8f0;
  border-radius: 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.admin-toggle-slider:before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.admin-toggle input:checked + .admin-toggle-slider { background: #0d7377; }
.admin-toggle input:checked + .admin-toggle-slider:before { transform: translateX(20px); }

.admin-org-select {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  outline: none;
  margin-bottom: 20px;
  width: 100%;
  max-width: 320px;
  cursor: pointer;
}

.admin-org-select:focus { border-color: #0d7377; }

.admin-override-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.admin-override-badge--on  { color: #0d7377; background: #d1faf8; }
.admin-override-badge--off { color: #ef4444; background: #fef2f2; }
.admin-override-badge--default { color: #94a3b8; background: #f1f5f9; }

.admin-empty {
  text-align: center;
  padding: 48px 24px;
  color: #94a3b8;
  font-size: 14px;
}

.admin-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  color: #0d7377;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.admin-button:hover {
  background: #f1f5f9;
}

.admin-button--selected {
  background: #0d7377;
  color: white;
  border-color: #0d7377;
}

.admin-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-saving {
  font-size: 12px;
  color: #0d7377;
  margin-left: 8px;
}
  .admin-user-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  gap: 16px;
  flex-wrap: wrap;
}
.admin-user-row:last-child { border-bottom: none; }

.admin-user-info { flex: 1; min-width: 200px; }

.admin-user-org-name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.admin-user-email {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.admin-user-date {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.admin-plan-select {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 10px;
  outline: none;
  cursor: pointer;
  min-width: 160px;
}
.admin-plan-select:focus { border-color: #0d7377; }

.admin-status-pill {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 20px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
}
.admin-status-pill--none { background: #fef2f2; color: #ef4444; }
`

const PLAN_FEATURES = [
  { key: 'payroll', label: 'Payroll' },
  { key: 'pay_stub_pdf', label: 'Pay stub PDF' },
  { key: 'ytd', label: 'YTD tracking' },
  { key: 't4', label: 'T4 data' },
  { key: 'multi_org', label: 'Multi-org' },
]

export default function AdminPanel() {
  const { isSuperAdmin } = useOrg()
  const navigate = useNavigate()
  const [tab, setTab] = useState('global') // 'global' | 'plans' | 'orgs'

  // Global flags
  const [flags, setFlags]   = useState([])
  const [saving, setSaving] = useState(null) // flag key being saved

  // Plans and plan-based feature control
  const [plans, setPlans] = useState([])
  const [planSaving, setPlanSaving] = useState(null)
  const [selectedPlanId, setSelectedPlanId] = useState(null)

  // Per-org overrides
  const [orgs, setOrgs]           = useState([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [overrides, setOverrides] = useState([]) // merged: flag + override

    // Users & plans (all orgs with owner + subscription)
  const [orgAccounts, setOrgAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [planChangeSaving, setPlanChangeSaving] = useState(null) // org_id being changed

  const [suspendSaving, setSuspendSaving] = useState(null)
  const [deletingOrgId, setDeletingOrgId] = useState(null)

  useEffect(() => {
    if (!isSuperAdmin) { navigate('/'); return }
    fetchFlags()
    fetchPlans()
    fetchOrgs()
  }, [isSuperAdmin])

  useEffect(() => {
    if (selectedOrg) fetchOverrides(selectedOrg)
  }, [selectedOrg])

  useEffect(() => {
    if (plans.length && !selectedPlanId) {
      setSelectedPlanId(plans[0].id)
    }
  }, [plans, selectedPlanId])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchFlags() {
    const { data } = await supabase
      .from('feature_flags')
      .select('*')
      .order('label')
    setFlags(data || [])
  }

  async function fetchOrgs() {
    const { data } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name')
    setOrgs(data || [])
    if (data?.length) setSelectedOrg(data[0].id)
  }

  async function fetchPlans() {
    const { data } = await supabase
      .from('plans')
      .select('*')
      .order('price_monthly', { ascending: true })
    setPlans(data || [])
  }

    async function fetchOrgAccounts() {
    setAccountsLoading(true)
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: false })

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')

    const { data: allSubs } = await supabase
      .from('org_subscriptions')
      .select('org_id, plan_id, status, plans(id, name, price_monthly)')

    const profileMap = new Map((allProfiles || []).map(p => [p.id, p]))
    const subMap = new Map((allSubs || []).map(s => [s.org_id, s]))

    const merged = (allOrgs || []).map(org => ({
      ...org,
      owner: profileMap.get(org.owner_id) || null,
      subscription: subMap.get(org.id) || null,
    }))

    setOrgAccounts(merged)
    setAccountsLoading(false)
  }

    useEffect(() => {
    if (!isSuperAdmin) { navigate('/'); return }
    fetchFlags()
    fetchPlans()
    fetchOrgs()
    fetchOrgAccounts()
  }, [isSuperAdmin])

    async function changeOrgPlan(orgId, newPlanId) {
    setPlanChangeSaving(orgId)
    try {
      const { data: existing } = await supabase
        .from('org_subscriptions')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('org_subscriptions')
          .update({ plan_id: newPlanId, status: 'active' })
          .eq('org_id', orgId)
      } else {
        await supabase
          .from('org_subscriptions')
          .insert({ org_id: orgId, plan_id: newPlanId, status: 'active' })
      }
      await fetchOrgAccounts()
    } catch (err) {
      alert('Failed to change plan: ' + err.message)
    } finally {
      setPlanChangeSaving(null)
    }
  }

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || plans[0] || null

  async function togglePlanFeature(plan, featureKey) {
    setPlanSaving(`${plan.id}:${featureKey}`)
    const updatedFeatures = {
      ...(plan.features || {}),
      [featureKey]: !plan.features?.[featureKey],
    }
    const { error } = await supabase
      .from('plans')
      .update({ features: updatedFeatures })
      .eq('id', plan.id)
    if (error) {
      console.error('Update plan feature error:', error)
    }
    await fetchPlans()
    setPlanSaving(null)
  }

  async function fetchOverrides(orgId) {
    const { data } = await supabase
      .from('org_feature_overrides')
      .select('*')
      .eq('org_id', orgId)
    setOverrides(data || [])
  }

  // ── Toggle global flag ────────────────────────────────────────────────────

  async function toggleGlobal(flag) {
    setSaving(flag.key)
    await supabase
      .from('feature_flags')
      .update({ enabled: !flag.enabled })
      .eq('key', flag.key)
    await fetchFlags()
    setSaving(null)
  }

  // ── Toggle per-org override ───────────────────────────────────────────────

  async function toggleOverride(flag) {
    if (!selectedOrg) return
    setSaving(flag.key)

    const existing = overrides.find(o => o.flag_key === flag.key)
    const globalDefault = flags.find(f => f.key === flag.key)?.enabled ?? true

    if (existing) {
      // If override matches global default → remove it (no need to store)
      if (existing.enabled === !globalDefault) {
        // Toggle it to match global → just delete
        await supabase
          .from('org_feature_overrides')
          .delete()
          .eq('org_id', selectedOrg)
          .eq('flag_key', flag.key)
      } else {
        // Flip the override
        await supabase
          .from('org_feature_overrides')
          .update({ enabled: !existing.enabled })
          .eq('org_id', selectedOrg)
          .eq('flag_key', flag.key)
      }
    } else {
      // No override yet → create one that flips the global default
      await supabase
        .from('org_feature_overrides')
        .insert({ org_id: selectedOrg, flag_key: flag.key, enabled: !globalDefault })
    }

    await fetchOverrides(selectedOrg)
    setSaving(null)
  }

  // ── Effective value for a flag in selected org ────────────────────────────

  function effectiveValue(flagKey) {
    const override = overrides.find(o => o.flag_key === flagKey)
    if (override) return { value: override.enabled, isOverride: true }
    const global = flags.find(f => f.key === flagKey)
    return { value: global?.enabled ?? true, isOverride: false }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{css}</style>
      <div className="admin-wrap">

        <div className="admin-header">
          <h1 className="admin-title">Admin Panel</h1>
          <span className="admin-badge">Super Admin</span>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'global' ? 'admin-tab--active' : ''}`}
            onClick={() => setTab('global')}
          >
            Global Feature Flags
          </button>
          <button
            className={`admin-tab ${tab === 'plans' ? 'admin-tab--active' : ''}`}
            onClick={() => setTab('plans')}
          >
            Plans
          </button>
          <button
            className={`admin-tab ${tab === 'orgs' ? 'admin-tab--active' : ''}`}
            onClick={() => setTab('orgs')}
          >
            Per-Org Overrides
          </button>
          <button
            className={`admin-tab ${tab === 'users' ? 'admin-tab--active' : ''}`}
            onClick={() => setTab('users')}
          >
            Users & Plans
          </button>
        </div>

        {/* ── Global Flags ── */}
        {tab === 'global' && (
          <>
            <div className="admin-section-title">Global Defaults</div>
            <div className="admin-card">
              {flags.length === 0 && <div className="admin-empty">No feature flags found.</div>}
              {flags.map(flag => (
                <div key={flag.key} className="admin-flag-row">
                  <div className="admin-flag-info">
                    <div className="admin-flag-label">{flag.label}</div>
                    <div className="admin-flag-key">{flag.key}</div>
                  </div>
                  {saving === flag.key && <span className="admin-saving">Saving…</span>}
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={flag.enabled}
                      onChange={() => toggleGlobal(flag)}
                      disabled={saving === flag.key}
                    />
                    <span className="admin-toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
          </>
        )}

                {/* ── Users & Plans ── */}
        {tab === 'users' && (
          <>
            <div className="admin-section-title">All Signed-Up Organizations</div>
            <div className="admin-card">
              {accountsLoading && <div className="admin-empty">Loading…</div>}
              {!accountsLoading && orgAccounts.length === 0 && (
                <div className="admin-empty">No organizations found.</div>
              )}
              {!accountsLoading && orgAccounts.map(org => (
                <div key={org.id} className="admin-user-row">
                  <div className="admin-user-info">
                    <div className="admin-user-org-name">{org.name}</div>
                    <div className="admin-user-email">
                      {org.owner?.email || org.owner?.full_name || '— no owner profile —'}
                    </div>
                    <div className="admin-user-date">
                      Joined {new Date(org.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  {org.subscription ? (
                    <span className="admin-status-pill">{org.subscription.status}</span>
                  ) : (
                    <span className="admin-status-pill admin-status-pill--none">No plan</span>
                  )}

                  <select
                    className="admin-plan-select"
                    value={org.subscription?.plan_id || ''}
                    onChange={e => changeOrgPlan(org.id, e.target.value)}
                    disabled={planChangeSaving === org.id}
                  >
                    <option value="" disabled>Select plan…</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name.charAt(0).toUpperCase() + p.name.slice(1)} — ${p.price_monthly}/mo
                      </option>
                    ))}
                  </select>

                  {planChangeSaving === org.id && <span className="admin-saving">Saving…</span>}
                </div>
              ))}

                              <div key={org.id} className="admin-user-row">
                  <div className="admin-user-info">
                    <div className="admin-user-org-name">{org.name}</div>
                    <div className="admin-user-email">
                      {org.owner?.email || org.owner?.full_name || '— no owner profile —'}
                    </div>
                    <div className="admin-user-date">
                      Joined {new Date(org.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  {org.subscription ? (
                    <span className={`admin-status-pill${org.subscription.status === 'suspended' ? ' admin-status-pill--none' : ''}`}>
                      {org.subscription.status}
                    </span>
                  ) : (
                    <span className="admin-status-pill admin-status-pill--none">No plan</span>
                  )}

                  <select
                    className="admin-plan-select"
                    value={org.subscription?.plan_id || ''}
                    onChange={e => changeOrgPlan(org.id, e.target.value)}
                    disabled={planChangeSaving === org.id}
                  >
                    <option value="" disabled>Select plan…</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name.charAt(0).toUpperCase() + p.name.slice(1)} — ${p.price_monthly}/mo
                      </option>
                    ))}
                  </select>

                  {planChangeSaving === org.id && <span className="admin-saving">Saving…</span>}

                  <button
                    className="admin-button"
                    onClick={() => toggleSuspend(org)}
                    disabled={suspendSaving === org.id || !org.subscription}
                    title={!org.subscription ? 'Assign a plan first' : ''}
                  >
                    {suspendSaving === org.id
                      ? 'Saving…'
                      : org.subscription?.status === 'suspended'
                        ? 'Reactivate'
                        : 'Suspend'}
                  </button>

                  <button
                    className="admin-button"
                    style={{ color: '#ef4444', borderColor: '#fecaca' }}
                    onClick={() => handleAdminDeleteOrg(org)}
                    disabled={deletingOrgId === org.id}
                  >
                    {deletingOrgId === org.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>

            </div>
          </>
        )}

        {/* ── Plan feature control ── */}
        {tab === 'plans' && (
          <>
            <div className="admin-section-title">Plan Feature Controls</div>
            <div className="admin-card">
              {plans.length === 0 && (
                <div className="admin-empty">
                  No plans found.
                  <div style={{ marginTop: 16 }}>
                    <button
                      className="admin-button"
                      onClick={() => navigate('/admin/seed-plans')}
                    >
                      Create default plan tiers
                    </button>
                  </div>
                </div>
              )}
              {plans.length > 0 && (
                <>
                  <div className="admin-plan-grid">
                    {plans.map(plan => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`admin-plan-card ${selectedPlanId === plan.id ? 'admin-plan-card--selected' : ''}`}
                      >
                        <div className="admin-plan-card-title">{plan.name}</div>
                        <div className="admin-plan-card-price">${plan.price_monthly}/mo</div>
                        <div className="admin-plan-card-meta">{plan.max_employees === -1 ? 'Unlimited employees' : `${plan.max_employees} employees`}</div>
                        <div className="admin-plan-card-meta">{plan.max_invoices === -1 ? 'Unlimited invoices' : `${plan.max_invoices} invoices`}</div>
                        <div className="admin-plan-card-meta">{plan.max_orgs === -1 ? 'Unlimited orgs' : `${plan.max_orgs} orgs`}</div>
                      </button>
                    ))}
                  </div>

                  {selectedPlan && (
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 22 }}>
                      <div className="admin-flag-label" style={{ marginBottom: 14 }}>{selectedPlan.name} package options</div>
                      <div className="admin-package-grid">
                        {PLAN_FEATURES.map(feature => {
                          const enabled = !!selectedPlan.features?.[feature.key]
                          return (
                            <div key={feature.key} className="admin-package-option-card">
                              <div>
                                <h4>{feature.label}</h4>
                                <p>{feature.key}</p>
                              </div>
                              <label className="admin-toggle">
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => togglePlanFeature(selectedPlan, feature.key)}
                                  disabled={planSaving === `${selectedPlan.id}:${feature.key}`}
                                />
                                <span className="admin-toggle-slider" />
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── Per-Org Overrides ── */}
        {tab === 'orgs' && (
          <>
            <div className="admin-section-title">Select Organization</div>
            <select
              className="admin-org-select"
              value={selectedOrg}
              onChange={e => setSelectedOrg(e.target.value)}
            >
              {orgs.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>

            {selectedOrg && (
              <>
                <div className="admin-section-title">Feature Overrides</div>
                <div className="admin-card">
                  {flags.length === 0 && <div className="admin-empty">No feature flags found.</div>}
                  {flags.map(flag => {
                    const { value, isOverride } = effectiveValue(flag.key)
                    return (
                      <div key={flag.key} className="admin-flag-row">
                        <div className="admin-flag-info">
                          <div className="admin-flag-label">
                            {flag.label}
                            {isOverride && (
                              <span className={`admin-override-badge admin-override-badge--${value ? 'on' : 'off'}`}>
                                Override {value ? 'ON' : 'OFF'}
                              </span>
                            )}
                            {!isOverride && (
                              <span className="admin-override-badge admin-override-badge--default">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="admin-flag-key">{flag.key}</div>
                        </div>
                        {saving === flag.key && <span className="admin-saving">Saving…</span>}
                        <label className="admin-toggle">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={() => toggleOverride(flag)}
                            disabled={saving === flag.key}
                          />
                          <span className="admin-toggle-slider" />
                        </label>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

      </div>
    </>
  )
}