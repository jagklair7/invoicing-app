// src/pages/TimeTracking.jsx
// Log billable / non-billable hours (works on phone + desktop), then turn the
// unbilled ones for a customer into a draft invoice.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import SuspendedBanner from '../components/SuspendedBanner'
import { createDraftInvoice } from '../utils/createDraftInvoice'

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

// Local calendar date (not UTC), so an evening entry isn't dated tomorrow.
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

const HOUR_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 4]

const css = `
.tt-overlay { position:fixed; inset:0; z-index:70; background:rgba(15,23,42,.45); display:flex; align-items:flex-end; justify-content:center; }
@media (min-width:640px){ .tt-overlay { align-items:center; } }
.tt-modal { background:#fff; width:100%; max-width:480px; border-radius:16px 16px 0 0; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 20px 50px rgba(15,23,42,.25); }
@media (min-width:640px){ .tt-modal { border-radius:16px; } }
.tt-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid #f1f5f9; }
.tt-modal-title { font-size:15px; font-weight:700; color:#0f172a; }
.tt-close { background:none; border:none; font-size:22px; color:#94a3b8; cursor:pointer; line-height:1; }
.tt-modal-body { padding:16px 18px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
.tt-modal-footer { padding:12px 18px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid #f1f5f9; display:flex; gap:8px; justify-content:flex-end; }
.tt-field { display:flex; flex-direction:column; gap:4px; }
.tt-field > label { font-size:12px; font-weight:600; color:#475569; }
.tt-input { width:100%; padding:9px 11px; font-size:16px; border:1.5px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-family:inherit; outline:none; }
.tt-input:focus { border-color:#0d7377; background:#fff; }
.tt-btn { padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; border:none; cursor:pointer; font-family:inherit; }
.tt-btn:disabled { opacity:.45; cursor:not-allowed; }
.tt-btn--primary { background:#0d7377; color:#fff; }
.tt-btn--ghost { background:#f1f5f9; color:#475569; }
.tt-btn--danger { background:#fff5f5; color:#dc2626; margin-right:auto; }
.tt-chip { padding:6px 12px; border-radius:9999px; font-size:12px; font-weight:600; border:1.5px solid #e2e8f0; background:#fff; color:#475569; cursor:pointer; }
.tt-chip--on { background:#0d7377; border-color:#0d7377; color:#fff; }
.tt-preset { padding:5px 10px; border-radius:7px; font-size:12px; font-weight:600; border:1.5px solid #e2e8f0; background:#fff; color:#475569; cursor:pointer; }
.tt-preset--on { background:#e8f5f5; border-color:#0d7377; color:#0d7377; }
.tt-fab { position:fixed; right:16px; bottom:calc(76px + env(safe-area-inset-bottom) + 12px); width:56px; height:56px; border-radius:9999px; background:#0d7377; color:#fff; font-size:28px; border:none; box-shadow:0 6px 18px rgba(13,115,119,.4); z-index:45; cursor:pointer; }
.tt-fab:disabled { opacity:.4; }
`

export default function TimeTracking() {
  const navigate = useNavigate()
  const { activeOrg, isSuspended } = useOrg()
  const orgId = activeOrg?.orgId

  const [entries, setEntries]     = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)

  const [status, setStatus]             = useState('unbilled') // unbilled | billed | all
  const [customerFilter, setCustomerFilter] = useState('')
  const [fromDate, setFromDate]         = useState('')
  const [toDate, setToDate]             = useState('')
  const [selected, setSelected]         = useState({})
  const [modal, setModal]               = useState(null)       // { entry } | null
  const [creating, setCreating]         = useState(null)

  async function fetchAll() {
    if (!orgId) return
    setLoading(true)
    const [e, c] = await Promise.all([
      supabase.from('time_entries')
        .select('*, invoices(id, number, status)')
        .eq('org_id', orgId)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('customers')
        .select('id, name, parent_customer_id, default_notes')
        .eq('org_id', orgId)
        .order('name'),
    ])
    if (e.error) alert('Error loading time entries: ' + e.error.message)
    setEntries(e.data || [])
    setCustomers(c.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [orgId])

  const customerName = (id) => customers.find(c => c.id === id)?.name || 'No customer'

  // Billed = linked to an invoice that isn't void.
  const isBilled = (e) => !!e.invoice_id && e.invoices?.status !== 'void'
  const canInvoice = (e) => e.billable && !isBilled(e) && !!e.customer_id

  const visible = useMemo(() => entries.filter(e => {
    if (status === 'unbilled' && isBilled(e)) return false
    if (status === 'billed' && !isBilled(e)) return false
    if (customerFilter && e.customer_id !== customerFilter) return false
    if (fromDate && e.work_date < fromDate) return false
    if (toDate && e.work_date > toDate) return false
    return true
  }), [entries, status, customerFilter, fromDate, toDate])

  const groups = useMemo(() => {
    const map = {}
    visible.forEach(e => { (map[e.customer_id || 'none'] ||= []).push(e) })
    return Object.entries(map)
      .map(([key, items]) => ({ key, customerId: key === 'none' ? null : key, items }))
      .sort((a, b) => customerName(a.customerId).localeCompare(customerName(b.customerId)))
  }, [visible, customers])

  const unbilledBillable = visible.filter(e => e.billable && !isBilled(e))
  const unbilledHours  = unbilledBillable.reduce((s, e) => s + Number(e.hours), 0)
  const unbilledAmount = unbilledBillable.reduce((s, e) => s + Number(e.hours) * Number(e.hourly_rate), 0)

  async function invoiceGroup(g) {
    const picked = g.items.filter(e => selected[e.id] && canInvoice(e))
      .sort((a, b) => a.work_date.localeCompare(b.work_date))
    if (!picked.length || !g.customerId) return
    setCreating(g.key)
    try {
      const inv = await createDraftInvoice({
        orgId,
        customerId: g.customerId,
        customers,
        lines: picked.map(e => ({
          name: `${e.work_date} — ${e.description}` + (e.notes ? `\n${e.notes}` : ''),
          quantity: Number(e.hours),
          unit_price: Number(e.hourly_rate) || 0,
        })),
      })
      const { error } = await supabase
        .from('time_entries')
        .update({ invoice_id: inv.id, updated_at: new Date().toISOString() })
        .in('id', picked.map(e => e.id))
        .eq('org_id', orgId)
      if (error) {
        alert(`Invoice ${inv.number} was created, but marking the time entries as billed failed: ${error.message}`)
      }
      navigate(`/invoices/${inv.id}`)
    } catch (err) {
      alert('Error creating invoice: ' + err.message)
    } finally {
      setCreating(null)
    }
  }

  function toggleAll(g, on) {
    setSelected(prev => {
      const next = { ...prev }
      g.items.filter(canInvoice).forEach(e => { next[e.id] = on })
      return next
    })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <style>{css}</style>
      <SuspendedBanner />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time</h1>
          <p className="text-sm text-slate-500">
            Unbilled: {unbilledHours.toFixed(2)} h · {fmt(unbilledAmount)} before tax
          </p>
        </div>
        <button
          onClick={() => setModal({ entry: null })}
          disabled={isSuspended}
          className="hidden md:inline-block bg-black text-white px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Log Time
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {['unbilled', 'billed', 'all'].map(s => (
          <button key={s} className={`tt-chip ${status === s ? 'tt-chip--on' : ''}`} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <select className="tt-input" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
          value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
          <option value="">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" className="tt-input" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
          value={fromDate} onChange={e => setFromDate(e.target.value)} aria-label="From date" />
        <input type="date" className="tt-input" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
          value={toDate} onChange={e => setToDate(e.target.value)} aria-label="To date" />
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl text-sm text-slate-500">
          No time entries match. Tap + to log some.
        </div>
      ) : groups.map(g => {
        const picked = g.items.filter(e => selected[e.id] && canInvoice(e))
        const pickedHours = picked.reduce((s, e) => s + Number(e.hours), 0)
        const pickedAmount = picked.reduce((s, e) => s + Number(e.hours) * Number(e.hourly_rate), 0)
        const invoiceable = g.items.filter(canInvoice)
        const gHours = g.items.reduce((s, e) => s + Number(e.hours), 0)
        return (
          <section key={g.key} className="mb-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div>
                <div className="font-semibold text-slate-900">{customerName(g.customerId)}</div>
                <div className="text-xs text-slate-500">{gHours.toFixed(2)} h in view</div>
              </div>
              {invoiceable.length > 0 && (
                <div className="flex items-center gap-2">
                  <button className="text-xs text-teal-700 font-semibold bg-transparent border-none cursor-pointer"
                    onClick={() => toggleAll(g, picked.length !== invoiceable.length)}>
                    {picked.length === invoiceable.length ? 'Clear' : 'Select all'}
                  </button>
                  <button className="tt-btn tt-btn--primary"
                    disabled={!picked.length || creating === g.key || isSuspended}
                    onClick={() => invoiceGroup(g)}>
                    {creating === g.key
                      ? 'Creating…'
                      : picked.length
                        ? `Invoice ${pickedHours.toFixed(2)} h · ${fmt(pickedAmount)}`
                        : 'Create invoice'}
                  </button>
                </div>
              )}
            </header>

            {g.items.map(e => {
              const billed = isBilled(e)
              const amount = Number(e.hours) * Number(e.hourly_rate)
              return (
                <div key={e.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 cursor-pointer hover:bg-slate-50"
                  onClick={() => billed ? navigate(`/invoices/${e.invoice_id}`) : setModal({ entry: e })}>
                  {canInvoice(e) ? (
                    <input type="checkbox" className="mt-1" checked={!!selected[e.id]}
                      onClick={ev => ev.stopPropagation()}
                      onChange={ev => setSelected(p => ({ ...p, [e.id]: ev.target.checked }))} />
                  ) : <span style={{ width: 13 }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{e.description}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(e.work_date)}
                      {!e.billable && ' · Non-billable'}
                      {billed && e.invoices?.number && ` · On ${e.invoices.number}`}
                      {e.billable && !e.customer_id && ' · Set a customer to invoice'}
                    </div>
                    {e.notes && <div className="text-xs text-slate-400 mt-0.5 whitespace-pre-wrap">{e.notes}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-slate-900">{Number(e.hours).toFixed(2)} h</div>
                    {e.billable && (
                      <div className="text-xs text-slate-500">{fmt(amount)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      {/* Mobile FAB */}
      <button className="tt-fab md:hidden" aria-label="Log time" disabled={isSuspended}
        onClick={() => setModal({ entry: null })}>+</button>

      {modal && (
        <TimeEntryModal
          entry={modal.entry}
          orgId={orgId}
          customers={customers}
          entries={entries}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ── Add / edit one entry ─────────────────────────────────────────────────────
function TimeEntryModal({ entry, orgId, customers, entries, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState(entry?.customer_id || '')
  const [workDate, setWorkDate]     = useState(entry?.work_date || localToday())
  const [description, setDescription] = useState(entry?.description || '')
  const [hours, setHours]           = useState(entry ? String(Number(entry.hours)) : '1')
  const [rate, setRate]             = useState(entry ? String(Number(entry.hourly_rate)) : '')
  const [billable, setBillable]     = useState(entry ? entry.billable : true)
  const [notes, setNotes]           = useState(entry?.notes || '')
  const [saving, setSaving]         = useState(false)

  // Pre-fill the rate with the last one used for this customer.
  function pickCustomer(id) {
    setCustomerId(id)
    if (!rate || Number(rate) === 0) {
      const last = entries.find(e => e.customer_id === id && Number(e.hourly_rate) > 0)
      if (last) setRate(String(Number(last.hourly_rate)))
    }
  }

  const hoursNum = Number(hours)
  const rateNum = Number(rate) || 0
  const valid = description.trim() && hoursNum > 0 && hoursNum <= 24

  async function save(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const payload = {
      customer_id: customerId || null,
      work_date: workDate,
      description: description.trim(),
      notes: notes.trim() || null,
      hours: Math.round(hoursNum * 100) / 100,
      hourly_rate: rateNum,
      billable,
    }
    const { error } = entry
      ? await supabase.from('time_entries')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', entry.id).eq('org_id', orgId)
      : await supabase.from('time_entries').insert([{ ...payload, org_id: orgId }])
    setSaving(false)
    if (error) { alert('Error saving time entry: ' + error.message); return }
    onSaved()
  }

  async function remove() {
    if (!window.confirm('Delete this time entry?')) return
    setSaving(true)
    const { error } = await supabase.from('time_entries')
      .delete().eq('id', entry.id).eq('org_id', orgId)
    setSaving(false)
    if (error) { alert('Error deleting time entry: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="tt-overlay" onClick={onClose}>
      <form className="tt-modal" onClick={e => e.stopPropagation()} onSubmit={save}>
        <div className="tt-modal-header">
          <span className="tt-modal-title">{entry ? 'Edit Time Entry' : 'Log Time'}</span>
          <button type="button" className="tt-close" onClick={onClose}>×</button>
        </div>

        <div className="tt-modal-body">
          <div className="tt-field">
            <label>Customer</label>
            <select className="tt-input" value={customerId} onChange={e => pickCustomer(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="tt-field">
            <label>Work done</label>
            <input className="tt-input" value={description} autoFocus
              placeholder="e.g., Configured firewall and VPN"
              onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="tt-field">
            <label>Date</label>
            <input type="date" className="tt-input" value={workDate} onChange={e => setWorkDate(e.target.value)} />
          </div>

          <div className="tt-field">
            <label>Hours</label>
            <input type="number" inputMode="decimal" step="0.25" min="0.25" max="24"
              className="tt-input" value={hours} onChange={e => setHours(e.target.value)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {HOUR_PRESETS.map(p => (
                <button key={p} type="button"
                  className={`tt-preset ${hoursNum === p ? 'tt-preset--on' : ''}`}
                  onClick={() => setHours(String(p))}>
                  {p < 1 ? `${p * 60}m` : `${p}h`}
                </button>
              ))}
            </div>
          </div>

          <div className="tt-field">
            <label>Hourly rate</label>
            <input type="number" inputMode="decimal" step="0.01" min="0"
              className="tt-input" value={rate} placeholder="0.00" onChange={e => setRate(e.target.value)} />
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: '#334155' }}>
            <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
            Billable{billable && hoursNum > 0 ? ` — ${fmt(hoursNum * rateNum)} before tax` : ''}
          </label>

          <div className="tt-field">
            <label>Notes (appear under the invoice line)</label>
            <textarea className="tt-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="tt-modal-footer">
          {entry && (
            <button type="button" className="tt-btn tt-btn--danger" onClick={remove} disabled={saving}>Delete</button>
          )}
          <button type="button" className="tt-btn tt-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="tt-btn tt-btn--primary" disabled={saving || !valid}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
