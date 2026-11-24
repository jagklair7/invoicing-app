// src/components/ImportHoursModal.jsx
// Imports the CSV exported by the SchedulePlanner macOS app and creates one
// DRAFT invoice per client. Mirrors InvoiceForm.jsx: org-scoped numbering using
// organization_settings.invoice_prefix, org default tax via invoiceTax utils,
// notes auto-filled from the customer's default_notes template, and
// invoice_items rows { invoice_id, org_id, product_id, name, quantity, unit_price }.
//
// Uses the modal/field/button classes defined in Invoices.jsx's css string, so
// it must be rendered inside that page.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { checkCanCreateInvoice } from '../utils/planLimits'
import { resolveDefaultNotes, textTemplateToHtml } from '../utils/notesTemplate'
import { calcInvoiceTax, taxColumns, taxConfigFromSettings } from '../utils/invoiceTax'

// Same default as InvoiceForm.jsx (Net 30).
const DEFAULT_TERMS_DAYS = 30

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Minimal RFC-4180 style parser (quoted fields, "" escapes, CRLF/LF).
function parseCSV(text) {
  const src = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some(x => x !== '')) rows.push(row)
  }
  return rows
}

// Expects the planner's columns: Client,Date,Description,Hours,Rate,Amount,Notes,Invoiced
function entriesFromCSV(text) {
  const rows = parseCSV(text)
  if (rows.length < 2) throw new Error('The file has no data rows.')
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const need = ['client', 'date', 'description', 'hours', 'rate']
  const missing = need.filter(n => col(n) === -1)
  if (missing.length) throw new Error('Missing column(s): ' + missing.join(', ') + '. Use the CSV exported from SchedulePlanner.')

  return rows.slice(1).map(r => ({
    client:   (r[col('client')] || '').trim(),
    date:     (r[col('date')] || '').trim(),
    title:    (r[col('description')] || '').trim(),
    hours:    Number(r[col('hours')]) || 0,
    rate:     Number(r[col('rate')]) || 0,
    notes:    col('notes') !== -1 ? (r[col('notes')] || '').trim() : '',
    invoiced: col('invoiced') !== -1 && (r[col('invoiced')] || '').trim().toLowerCase() === 'yes',
  })).filter(e => e.hours > 0)
}

// Stable fingerprint of one planner entry, stored on invoice_items.source_key so
// importing the same entry twice can be detected. Notes are excluded on purpose,
// so editing notes in the planner does not defeat the check.
async function sourceKey(e) {
  const raw = [e.client.toLowerCase(), e.date, e.title, e.hours.toFixed(2), e.rate.toFixed(2)].join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return 'sp1:' + hex.slice(0, 24)
}

// Returns { source_key: invoice number } for entries already imported into this org.
async function findImported(orgId, keys) {
  const found = {}
  for (let i = 0; i < keys.length; i += 50) {
    const { data, error } = await supabase
      .from('invoice_items')
      .select('source_key, invoice_id')
      .eq('org_id', orgId)
      .in('source_key', keys.slice(i, i + 50))
    if (error) {
      throw new Error('Duplicate check failed: ' + error.message +
        ' (has the invoice_items.source_key SQL migration been run?)')
    }
    ;(data || []).forEach(r => { found[r.source_key] = r.invoice_id })
  }
  const ids = [...new Set(Object.values(found))]
  if (ids.length) {
    const { data } = await supabase.from('invoices').select('id, number').in('id', ids)
    const num = Object.fromEntries((data || []).map(r => [r.id, r.number]))
    Object.keys(found).forEach(k => { found[k] = num[found[k]] || 'an existing invoice' })
  }
  return found
}

export default function ImportHoursModal({ orgId, onClose, onDone }) {
  const navigate = useNavigate()
  const [customers, setCustomers]   = useState([])
  const [entries, setEntries]       = useState([])
  const [skipped, setSkipped]       = useState(0)
  const [fileName, setFileName]     = useState('')
  const [mapping, setMapping]       = useState({})   // client name -> customer id
  const [included, setIncluded]     = useState({})   // client name -> bool
  const [withDates, setWithDates]   = useState(true)
  const [includeDupes, setIncludeDupes] = useState(false)
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  // Same select as InvoiceForm so notes templates resolve identically.
  useEffect(() => {
    if (!orgId) return
    supabase.from('customers')
      .select('id, name, parent_customer_id, default_notes')
      .eq('org_id', orgId)
      .order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [orgId])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const all = entriesFromCSV(await file.text())
      const open = all.filter(x => !x.invoiced)
      const keyed = await Promise.all(open.map(async x => ({ ...x, key: await sourceKey(x) })))
      const imported = await findImported(orgId, keyed.map(x => x.key))
      const withDupes = keyed.map(x => ({ ...x, dupOf: imported[x.key] || null }))
      setSkipped(all.length - open.length)
      setEntries(withDupes)
      setFileName(file.name)
      const clients = [...new Set(withDupes.map(x => x.client))]
      const map = {}, inc = {}
      clients.forEach(c => {
        const match = customers.find(cu => cu.name.trim().toLowerCase() === c.toLowerCase())
        map[c] = match?.id || ''
        inc[c] = !!match
      })
      setMapping(map)
      setIncluded(inc)
    } catch (err) {
      setEntries([]); setFileName('')
      setError(err.message)
    }
  }

  const groups = Object.entries(
    entries.reduce((acc, x) => { (acc[x.client] ||= []).push(x); return acc }, {})
  ).map(([client, all]) => {
    const items = includeDupes ? all : all.filter(x => !x.dupOf)
    const dupes = all.filter(x => x.dupOf)
    return {
      client, items,
      dupCount: dupes.length,
      dupNumbers: [...new Set(dupes.map(x => x.dupOf))],
      hours: items.reduce((s, i) => s + i.hours, 0),
      subtotal: items.reduce((s, i) => s + i.hours * i.rate, 0),
    }
  })

  const ready = groups.filter(g => included[g.client] && mapping[g.client] && g.items.length > 0)

  function lineName(x) {
    const head = withDates && x.date ? `${x.date} — ${x.title}` : x.title
    return x.notes ? `${head}\n${x.notes}` : head
  }

  async function create() {
    if (!ready.length) return
    setSaving(true)
    const created = []
    try {
      const { allowed, reason } = await checkCanCreateInvoice(orgId)
      if (!allowed) { alert(reason); return }

      // Org tax + numbering, read the same way InvoiceForm does.
      const { data: settings } = await supabase
        .from('organization_settings')
        .select('invoice_prefix, tax_name, tax_pct, tax2_name, tax2_pct')
        .eq('org_id', orgId)
        .maybeSingle()
      const taxCfg = taxConfigFromSettings(settings)
      const prefix = settings?.invoice_prefix ?? 'INV-'

      const { data: last } = await supabase
        .from('invoices').select('number').eq('org_id', orgId)
        .order('created_at', { ascending: false }).limit(1)
      let lastNum = last?.[0]?.number ? parseInt(last[0].number.replace(/\D/g, '')) || 0 : 0

      const today = new Date().toISOString().split('T')[0]

      for (const g of ready) {
        lastNum += 1
        const number = `${prefix}${String(lastNum).padStart(3, '0')}`
        const customer = customers.find(c => c.id === mapping[g.client])
        const template = customer ? resolveDefaultNotes(customer, customers) : ''

        const items = g.items.map(x => ({
          name: lineName(x),
          quantity: Math.round(x.hours * 100) / 100,
          unit_price: x.rate,
          source_key: x.key,
        }))
        const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
        const taxCalc = calcInvoiceTax(subtotal, taxCfg)

        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert([{
            customer_id: mapping[g.client],
            number,
            date: today,
            due_date: addDays(today, DEFAULT_TERMS_DAYS),
            status: 'draft',
            notes: template ? textTemplateToHtml(template) : '',
            po_number: null,
            online_payment_enabled: false,
            org_id: orgId,
            subtotal, tax: taxCalc.tax, total: taxCalc.total,
            ...taxColumns(taxCfg),
          }])
          .select()
          .single()
        if (invErr) throw invErr

        const { error: itemErr } = await supabase
          .from('invoice_items')
          .insert(items.map(i => ({
            invoice_id: inv.id,
            org_id: orgId,
            product_id: null,
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            source_key: i.source_key,
          })))
        if (itemErr) throw itemErr
        created.push(inv)
      }

      onDone?.()
      onClose()
      if (created.length === 1) navigate(`/invoices/${created[0].id}`)
    } catch (err) {
      const done = created.length ? ` (${created.length} draft invoice(s) were already created: ${created.map(c => c.number).join(', ')})` : ''
      alert('Error importing hours: ' + err.message + done)
      if (created.length) onDone?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-modal2" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="inv-modal2-header">
          <span className="inv-modal2-title">Import Hours from SchedulePlanner</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>

        <div className="inv-modal2-body">
          <div className="inv-field2">
            <label>CSV file</label>
            <input className="inv-input2" type="file" accept=".csv,text/csv" onChange={handleFile} />
          </div>

          {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}

          {fileName && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {fileName}: {entries.length} unbilled entr{entries.length === 1 ? 'y' : 'ies'}
              {skipped > 0 && ` (${skipped} already marked invoiced were skipped)`}
            </div>
          )}

          {groups.length > 0 && (
            <>
              <label style={{ fontSize: 13, color: '#334155', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={withDates} onChange={e => setWithDates(e.target.checked)} />
                Put the work date at the start of each line description
              </label>

              {entries.some(x => x.dupOf) && (
                <label style={{ fontSize: 13, color: '#a16207', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={includeDupes} onChange={e => setIncludeDupes(e.target.checked)} />
                  Include lines that were already imported (creates duplicates)
                </label>
              )}

              {groups.map(g => (
                <div key={g.client} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                      <input type="checkbox"
                        checked={!!included[g.client]}
                        onChange={e => setIncluded(p => ({ ...p, [g.client]: e.target.checked }))} />
                      {g.client || 'No client in file'}
                    </label>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      {g.items.length} line{g.items.length === 1 ? '' : 's'} · {g.hours.toFixed(2)} h · {fmt(g.subtotal)} before tax
                    </span>
                  </div>
                  <select className="inv-input2 inv-select2"
                    value={mapping[g.client] || ''}
                    onChange={e => {
                      const v = e.target.value
                      setMapping(p => ({ ...p, [g.client]: v }))
                      setIncluded(p => ({ ...p, [g.client]: !!v }))
                    }}>
                    <option value="">Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {g.dupCount > 0 && (
                    <span style={{ fontSize: 12, color: '#a16207' }}>
                      {g.dupCount} line{g.dupCount === 1 ? '' : 's'} already imported on {g.dupNumbers.join(', ')}
                      {includeDupes ? ' — included anyway.' : ' — skipped.'}
                    </span>
                  )}
                  {!mapping[g.client] && (
                    <span style={{ fontSize: 12, color: '#a16207' }}>
                      No customer named “{g.client}” — pick one to include this client.
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="inv-modal2-footer">
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>Cancel</button>
          <button className="inv-btn2 inv-btn2--primary" onClick={create} disabled={saving || !ready.length}>
            {saving ? 'Creating…' : `Create ${ready.length} draft invoice${ready.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
