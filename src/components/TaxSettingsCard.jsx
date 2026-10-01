// src/components/TaxSettingsCard.jsx
// Default tax for NEW invoices in this organization. Rendered inside Settings.jsx,
// so it reuses that page's .settings-* classes. Saves on its own (only the tax columns).
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import {
  TAX_PRESETS, calcInvoiceTax, describeTax, findPresetKey, taxConfigFromSettings,
} from '../utils/invoiceTax'

export default function TaxSettingsCard() {
  const { activeOrg } = useOrg()
  const orgId = activeOrg?.orgId

  const [currentCfg, setCurrentCfg] = useState(null)   // what's saved in the database
  const [presetKey, setPresetKey]   = useState('GST')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase
      .from('organization_settings')
      .select('tax_name, tax_pct, tax2_name, tax2_pct')
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const cfg = taxConfigFromSettings(data)
        setCurrentCfg(cfg)
        setPresetKey(findPresetKey(cfg) || 'CUSTOM')
      })
    return () => { cancelled = true }
  }, [orgId])

  if (!currentCfg) return null

  const preset = TAX_PRESETS.find(p => p.key === presetKey)
  const selectedCfg = preset
    ? { name: preset.name, pct: preset.pct, name2: preset.name2, pct2: preset.pct2 }
    : currentCfg
  const preview = calcInvoiceTax(100, selectedCfg)

  async function handleSave() {
    if (!orgId || !preset) return
    setSaving(true); setSaved(false); setError('')
    try {
      const { error: upErr } = await supabase
        .from('organization_settings')
        .upsert({
          org_id: orgId,
          tax_name: preset.name,
          tax_pct: preset.pct,
          tax2_name: preset.name2 || null,
          tax2_pct: preset.pct2 || 0,
        }, { onConflict: 'org_id' })
      if (upErr) throw upErr
      setCurrentCfg({ name: preset.name, pct: preset.pct, name2: preset.name2 || null, pct2: preset.pct2 || 0 })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Could not save tax settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-title">Invoice Tax</div>
      <div className="settings-grid">
        <div className="settings-field settings-field--full">
          <label className="settings-label">Default tax for new invoices</label>
          <select className="settings-input" value={presetKey} onChange={e => setPresetKey(e.target.value)}>
            {presetKey === 'CUSTOM' && (
              <option value="CUSTOM" disabled>Custom (currently {describeTax(currentCfg)})</option>
            )}
            {TAX_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className="settings-hint">
            Pick the tax that applies where your business supplies its goods and services. You can
            override it on an individual invoice, for example for a customer in another province.
            Existing invoices are never changed. Confirm your rates with your accountant.
          </span>
        </div>
        <div className="settings-field settings-field--full">
          <span className="settings-hint">
            Example on $100.00:{' '}
            {preview.lines.map(l => `${l.label} $${l.amount.toFixed(2)}`).join(' + ')}
            {' '}= <strong>${preview.total.toFixed(2)}</strong>
          </span>
        </div>
      </div>
      <button
        className="settings-save-btn"
        onClick={handleSave}
        disabled={saving || presetKey === 'CUSTOM'}
        style={{ marginTop: 16 }}
      >
        {saving ? 'Saving…' : 'Save tax settings'}
      </button>
      {saved && <div className="settings-success">✓ Tax settings saved. This applies to new invoices.</div>}
      {error && <div style={{ color: '#e53e3e', fontSize: 12, marginTop: 8 }}>⚠ {error}</div>}
    </div>
  )
}