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

.admin-saving {
  font-size: 12px;
  color: #0d7377;
  margin-left: 8px;
}
`

export default function AdminPanel() {
  const { isSuperAdmin } = useOrg()
  const navigate = useNavigate()
  const [tab, setTab] = useState('global') // 'global' | 'orgs'

  // Global flags
  const [flags, setFlags]   = useState([])
  const [saving, setSaving] = useState(null) // flag key being saved

  // Per-org overrides
  const [orgs, setOrgs]           = useState([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [overrides, setOverrides] = useState([]) // merged: flag + override

  useEffect(() => {
    if (!isSuperAdmin) { navigate('/'); return }
    fetchFlags()
    fetchOrgs()
  }, [isSuperAdmin])

  useEffect(() => {
    if (selectedOrg) fetchOverrides(selectedOrg)
  }, [selectedOrg])

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
            className={`admin-tab ${tab === 'orgs' ? 'admin-tab--active' : ''}`}
            onClick={() => setTab('orgs')}
          >
            Per-Org Overrides
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