import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'

const FEATURES = [
  ['payroll', 'Payroll'],
  ['pay_stub_pdf', 'Pay stub PDF'],
  ['ytd', 'Year-to-date totals'],
  ['t4', 'T4 slips'],
  ['multi_org', 'Multiple organizations'],
]
const KNOWN_KEYS = FEATURES.map(([k]) => k)
const LIMITS = [
  ['max_employees', 'Employees'],
  ['max_invoices', 'Invoices per month'],
  ['max_orgs', 'Organizations'],
]

const asBool = (v) => v === true || String(v).toLowerCase() === 'true'
const dateInput = (d) => new Date(d).toISOString().slice(0, 10)
function dateFromNow(interval) {
  const d = new Date()
  if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 24, boxSizing: 'border-box' },
  h2: { margin: '0 0 4px', fontSize: 20 },
  sub: { margin: '0 0 16px', color: '#64748b', fontSize: 13 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '14px 0 4px' },
  input: { width: '100%', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  row: { display: 'flex', gap: 12 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '6px 0' },
  btn: { padding: '10px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14 },
  primary: { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0e7380', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  err: { background: '#fef2f2', color: '#b91c1c', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 12 },
  ok: { background: '#f0fdf4', color: '#15803d', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 12 },
  warn: { background: '#fffbeb', color: '#b45309', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 12 },
}

export default function CustomPlanEditor({ orgId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [orgName, setOrgName] = useState('')
  const [existing, setExisting] = useState(null) // custom plan row; null = creating
  const [sub, setSub] = useState(null)
  const [basePlans, setBasePlans] = useState([])
  const [extraFeatures, setExtraFeatures] = useState({}) // feature keys the editor doesn't know about; preserved on save
  const [periodDirty, setPeriodDirty] = useState(false)
  const [form, setForm] = useState({
    displayName: '', baseName: 'pro', price: '', interval: 'monthly', periodEnd: '', notes: '',
    limits: { max_employees: 0, max_invoices: 0, max_orgs: 1 },
    features: {},
  })

  useEffect(() => { load() }, [orgId])

  function splitFeatures(raw) {
    const f = raw && typeof raw === 'object' ? raw : {}
    const known = {}
    const extra = {}
    Object.entries(f).forEach(([k, v]) => {
      if (KNOWN_KEYS.includes(k)) known[k] = asBool(v)
      else extra[k] = v
    })
    return { known, extra }
  }

  function applyBase(row) {
    const { known, extra } = splitFeatures(row.features)
    setExtraFeatures(extra)
    setForm((f) => ({
      ...f,
      baseName: row.name,
      limits: { max_employees: row.max_employees, max_invoices: row.max_invoices, max_orgs: row.max_orgs },
      features: known,
    }))
  }

  async function load() {
    setLoading(true)
    setError('')
    const [orgRes, planRes, subRes, baseRes] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('plans').select('*').eq('custom_for_org_id', orgId).eq('is_custom', true).maybeSingle(),
      supabase.from('org_subscriptions').select('*').eq('org_id', orgId).maybeSingle(),
      supabase.from('plans').select('name, max_employees, max_invoices, max_orgs, features').eq('is_custom', false),
    ])
    const err = orgRes.error || planRes.error || subRes.error || baseRes.error
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const order = ['free', 'starter', 'pro', 'enterprise']
    const bases = (baseRes.data || []).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    setBasePlans(bases)
    setOrgName(orgRes.data?.name || '')
    setSub(subRes.data || null)
    setExisting(planRes.data || null)
    setPeriodDirty(false)

    if (planRes.data) {
      const p = planRes.data
      const s = subRes.data
      const { known, extra } = splitFeatures(p.features)
      setExtraFeatures(extra)
      const interval = s?.billing_interval || 'monthly'
      setForm({
        displayName: p.display_name || `${orgRes.data?.name || 'Custom'} Custom`,
        baseName: p.base_plan_name || 'pro',
        price: s?.custom_price != null ? String(s.custom_price) : String(p.price_monthly ?? ''),
        interval,
        periodEnd: s?.current_period_end ? dateInput(s.current_period_end) : dateFromNow(interval),
        notes: s?.billing_notes || '',
        limits: { max_employees: p.max_employees, max_invoices: p.max_invoices, max_orgs: p.max_orgs },
        features: known,
      })
    } else {
      const start = bases.find((b) => b.name === 'pro') || bases[0]
      setForm((f) => ({
        ...f,
        displayName: `${orgRes.data?.name || 'Custom'} Custom`,
        periodEnd: dateFromNow('monthly'),
      }))
      if (start) applyBase(start)
    }
    setLoading(false)
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setLimit = (key, value) => setForm((f) => ({ ...f, limits: { ...f.limits, [key]: value } }))
  const setFeature = (key, value) => setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }))

  async function save() {
    setError('')
    setNotice('')
    const price = Number(form.price)
    if (!form.displayName.trim()) return setError('Display name is required.')
    if (form.price === '' || !(price >= 0)) return setError('Enter a valid price.')
    if (!existing && !form.periodEnd) return setError('Period end is required.')
    for (const [key, label] of LIMITS) {
      const v = Number(form.limits[key])
      if (!Number.isInteger(v) || v < -1) return setError(`${label}: enter a whole number, or tick Unlimited.`)
    }

    const featuresPayload = {
      ...extraFeatures,
      ...Object.fromEntries(KNOWN_KEYS.map((k) => [k, !!form.features[k]])),
    }
    const sendPeriod = !existing || periodDirty
    setSaving(true)
    const { error: rpcErr } = await supabase.rpc('save_custom_plan', {
      p_org_id: orgId,
      p_base_plan: form.baseName,
      p_display_name: form.displayName.trim(),
      p_price: price,
      p_interval: form.interval,
      p_max_employees: Number(form.limits.max_employees),
      p_max_invoices: Number(form.limits.max_invoices),
      p_max_orgs: Number(form.limits.max_orgs),
      p_features: featuresPayload,
      p_notes: form.notes.trim() || null,
      p_period_end: sendPeriod ? new Date(`${form.periodEnd}T12:00:00`).toISOString() : null,
    })
    setSaving(false)
    if (rpcErr) return setError(rpcErr.message)
    setNotice('Saved.')
    await load()
    onSaved?.()
  }

  async function renew() {
    if (!window.confirm('Mark this customer as paid and extend by one billing period?')) return
    setError('')
    setNotice('')
    setSaving(true)
    const { data, error: rpcErr } = await supabase.rpc('renew_custom_plan', { p_org_id: orgId })
    setSaving(false)
    if (rpcErr) return setError(rpcErr.message)
    setNotice(`Renewed. New period end: ${new Date(data).toLocaleDateString('en-CA')}.`)
    await load()
    onSaved?.()
  }

  const detached = existing && sub && sub.plan_id !== existing.id

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={S.h2}>{existing ? 'Edit custom plan' : 'Create custom plan'}</h2>
        <p style={S.sub}>{orgName}</p>

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {detached && (
              <div style={S.warn}>
                This organization is currently on another plan (its custom plan lapsed). Click “Mark renewed” to put it back on this plan.
              </div>
            )}

            <label style={S.label}>Plan name shown to the customer</label>
            <input style={S.input} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />

            {!existing && (
              <>
                <label style={S.label}>Start from</label>
                <select
                  style={S.input}
                  value={form.baseName}
                  onChange={(e) => {
                    const row = basePlans.find((b) => b.name === e.target.value)
                    if (row) applyBase(row)
                  }}
                >
                  {basePlans.map((b) => (
                    <option key={b.name} value={b.name}>{b.name.charAt(0).toUpperCase() + b.name.slice(1)}</option>
                  ))}
                </select>
              </>
            )}

            <div style={S.row}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Price (CAD)</label>
                <input style={S.input} type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Billed</label>
                <select
                  style={S.input}
                  value={form.interval}
                  onChange={(e) => {
                    set('interval', e.target.value)
                    if (!existing) set('periodEnd', dateFromNow(e.target.value))
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>

            <label style={S.label}>Current period ends</label>
            <input
              style={S.input}
              type="date"
              value={form.periodEnd}
              onChange={(e) => { set('periodEnd', e.target.value); setPeriodDirty(true) }}
            />

            <label style={S.label}>Limits</label>
            {LIMITS.map(([key, label]) => {
              const unlimited = Number(form.limits[key]) === -1
              return (
                <div key={key} style={{ ...S.row, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
                  <input
                    style={{ ...S.input, width: 90 }}
                    type="number"
                    min="0"
                    disabled={unlimited}
                    value={unlimited ? '' : form.limits[key]}
                    onChange={(e) => setLimit(key, e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <label style={{ ...S.check, margin: 0 }}>
                    <input type="checkbox" checked={unlimited} onChange={(e) => setLimit(key, e.target.checked ? -1 : 5)} />
                    Unlimited
                  </label>
                </div>
              )
            })}

            <label style={S.label}>Features</label>
            {FEATURES.map(([key, label]) => (
              <label key={key} style={S.check}>
                <input type="checkbox" checked={!!form.features[key]} onChange={(e) => setFeature(key, e.target.checked)} />
                {label}
              </label>
            ))}

            <label style={S.label}>Billing notes (only you see these)</label>
            <textarea style={{ ...S.input, minHeight: 60 }} value={form.notes} onChange={(e) => set('notes', e.target.value)} />

            {error && <div style={S.err}>{error}</div>}
            {notice && <div style={S.ok}>{notice}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button style={S.primary} onClick={save} disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Create plan'}</button>
              {existing && <button style={S.btn} onClick={renew} disabled={saving}>Mark renewed</button>}
              <button style={{ ...S.btn, marginLeft: 'auto' }} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}