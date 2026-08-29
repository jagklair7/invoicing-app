// src/pages/Estimates.jsx
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'
import { exportEstimatePDF } from '../utils/exportEstimatePDF'
import SuspendedBanner from '../components/SuspendedBanner'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}
const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

function statusColor(status) {
  switch (status) {
    case 'approved':  return { bg: '#dcfce7', color: '#15803d' }
    case 'sent':      return { bg: '#dbeafe', color: '#1d4ed8' }
    case 'declined':  return { bg: '#fee2e2', color: '#dc2626' }
    case 'converted': return { bg: '#f3e8ff', color: '#7c3aed' }
    case 'draft':     return { bg: '#f1f5f9', color: '#64748b' }
    default:          return { bg: '#f1f5f9', color: '#64748b' }
  }
}

// ── CSS (matches Invoices.jsx exactly) ───────────────────────────────────────
const css = `
  .inv-list-root { font-family: 'DM Sans', system-ui, sans-serif; }

  .act-wrap { position: relative; }
  .act-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 7px;
    border: 1.5px solid #e2e8f0; background: white;
    cursor: pointer; color: #64748b; font-size: 16px; line-height: 1; transition: all .15s;
  }
  .act-btn:hover { background: #f1f5f9; border-color: #cbd5e1; color: #1e293b; }

  .act-menu {
    position: fixed; background: white; border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
    border: 1px solid #e2e8f0; min-width: 190px; z-index: 1000;
    overflow: hidden; animation: actFadeIn .12s ease;
  }
  @keyframes actFadeIn {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }
  .act-group { padding: 4px 0; }
  .act-group + .act-group { border-top: 1px solid #f1f5f9; }
  .act-item {
    display: flex; align-items: center; gap: 9px; width: 100%;
    padding: 9px 14px; background: none; border: none;
    font-family: 'DM Sans', sans-serif; font-size: 13px;
    color: #334155; cursor: pointer; text-align: left; transition: background .1s;
  }
  .act-item:hover { background: #f8fafc; }
  .act-item--danger { color: #dc2626; }
  .act-item--danger:hover { background: #fff5f5; }
  .act-item-icon { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }

  .inv-overlay {
    position: fixed; inset: 0; background: rgba(15,23,42,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 2000; padding: 16px; backdrop-filter: blur(2px);
  }
  .inv-modal2 {
    background: white; border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.18);
    width: 100%; max-width: 440px;
    max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
  }
  .inv-modal2-header {
    background: linear-gradient(135deg, #1e293b 0%, #2d3f55 100%);
    padding: 18px 22px; display: flex; align-items: center; justify-content: space-between;
  }
  .inv-modal2-title { font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 600; color: white; }
  .inv-modal2-close {
    background: rgba(255,255,255,0.1); border: none; color: white;
    width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
    font-size: 16px; display: flex; align-items: center; justify-content: center;
  }
  .inv-modal2-close:hover { background: rgba(255,255,255,0.2); }
  .inv-modal2-body { padding: 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex: 1; }
  .inv-modal2-footer {
    padding: 14px 22px; border-top: 1px solid #f1f5f9;
    display: flex; gap: 8px; justify-content: flex-end;
  }

  .inv-field2 { display: flex; flex-direction: column; gap: 5px; }
  .inv-field2 label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: #94a3b8;
  }
  .inv-input2 {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: #1e293b;
    background: white; border: 1.5px solid #e2e8f0; border-radius: 8px;
    padding: 8px 11px; outline: none; transition: border-color .15s, box-shadow .15s; width: 100%;
  }
  .inv-input2:focus { border-color: #0d7377; box-shadow: 0 0 0 3px rgba(13,115,119,0.1); }

  .inv-btn2 {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
    font-family: 'DM Sans', sans-serif; border: 1.5px solid #e2e8f0;
    background: white; color: #64748b; cursor: pointer; transition: all .15s;
  }
  .inv-btn2:hover { border-color: #94a3b8; color: #1e293b; }
  .inv-btn2--primary { background: #0d7377; color: white; border-color: #0d7377; }
  .inv-btn2--primary:hover { background: #14a0a5; border-color: #14a0a5; color: white; }
  .inv-btn2--ghost { background: transparent; border-color: transparent; color: #64748b; }
  .inv-btn2--ghost:hover { background: #f1f5f9; color: #1e293b; }
  .inv-btn2:disabled { opacity: 0.5; cursor: not-allowed; }

  .success-banner {
    display: flex; align-items: center; gap: 10px;
    background: #e8f5f5; border: 1px solid #b2e0e2;
    border-radius: 10px; padding: 14px 16px;
    font-size: 13px; color: #0d7377; font-weight: 500;
  }
  .error-banner {
    background: #fff5f5; border: 1px solid #fecaca;
    border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #dc2626;
  }
`

// ── Action Dropdown ───────────────────────────────────────────────────────────
function ActionMenu({ est, onAction, isSuspended }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef()

  function toggle(e) {
    e.stopPropagation()
    if (!open) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top:  rect.bottom + 6,
        left: Math.min(rect.right - 190, window.innerWidth - 200),
      })
    }
    setOpen(p => !p)
  }

  function pick(action, e) {
    e.stopPropagation()
    setOpen(false)
    onAction(action, est)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div className="act-wrap" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} className="act-btn" onClick={toggle} title="Actions">⋯</button>
      {open && (
        <div className="act-menu" style={{ top: menuPos.top, left: menuPos.left }}
          onClick={e => e.stopPropagation()}>
          <div className="act-group">
            <button className="act-item" onClick={e => pick('view', e)}>
              <span className="act-item-icon">👁</span> View
            </button>
            <button className="act-item" onClick={e => pick('edit', e)} disabled={isSuspended}>
              <span className="act-item-icon">✏️</span> Edit
            </button>
          </div>
          <div className="act-group">
            {est.status !== 'converted' && est.status !== 'declined' && (
              <button className="act-item" onClick={e => pick('send', e)}>
                <span className="act-item-icon">✉️</span> Send Estimate
              </button>
            )}
            {(est.status === 'sent' || est.status === 'draft') && (
              <button className="act-item" onClick={e => pick('approve', e)} disabled={isSuspended}>
                <span className="act-item-icon">✅</span> Mark Approved
              </button> 
            )}  
            {(est.status === 'sent' || est.status === 'draft') && (
              <button className="act-item" onClick={e => pick('decline', e)} disabled={isSuspended}>
                <span className="act-item-icon">❌</span> Mark Declined
              </button>
            )}
            {est.status === 'approved' && (
              <button className="act-item" onClick={e => pick('convert', e)} disabled={isSuspended}>
                <span className="act-item-icon">🔄</span> Convert to Invoice
              </button>
            )}
          </div>
          <div className="act-group">
            <button className="act-item" onClick={e => pick('pdf', e)} disabled={isSuspended}>
              <span className="act-item-icon">↓</span> Export as PDF
            </button>
          </div>
          <div className="act-group">
            <button className="act-item act-item--danger" onClick={e => pick('delete', e)} disabled={isSuspended}>
              <span className="act-item-icon">🗑</span> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Send Estimate Modal ───────────────────────────────────────────────────────
function SendEstimateModal({ est, customer, orgSettings, activeOrg, onClose, onDone }) {
  const [email, setEmail]     = useState(customer?.email || '')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null)

  async function send() {
    if (!email.trim()) return
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
          <div style="background:#1e293b;padding:24px 28px;border-radius:12px 12px 0 0;">
            <h2 style="color:white;margin:0;font-size:18px;">Estimate ${est.estimate_number}</h2>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">From ${orgSettings?.company_name || ''}</p>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
            <p style="font-size:15px;margin:0 0 14px;">Hi ${customer?.name || 'there'},</p>
            <p style="font-size:14px;color:#475569;margin:0 0 16px;">
              Please find your estimate <strong>${est.estimate_number}</strong>
              for <strong>${fmt(est.total)}</strong> attached.
              ${est.expiry_date ? `This estimate is valid until <strong>${fmtDate(est.expiry_date)}</strong>.` : ''}
            </p>
            <p style="font-size:14px;color:#475569;margin:0 0 16px;">
              Please don't hesitate to reach out if you have any questions.
            </p>
            <a href="mailto:${orgSettings?.company_email || 'info@klair.ca'}"
              style="display:inline-block;background:#0d7377;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">
              Contact Us
            </a>
            ${orgSettings?.company_phone ? `<p style="font-size:13px;color:#94a3b8;margin-top:16px;">${orgSettings.company_name || ''} · ${orgSettings.company_phone}</p>` : ''}
          </div>
        </div>
      `

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to:        email.trim(),
            subject:   `Estimate ${est.estimate_number} from ${orgSettings?.company_name || ''}`,
            html,
            pdfBase64: '',
            filename:  `estimate-${est.estimate_number}.pdf`,
          })
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Send failed')

      await supabase.from('estimates')
        .update({ status: 'sent' })
        .eq('id', est.id)
        .eq('org_id', activeOrg.orgId)

      setResult({ ok: true })
      onDone()
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-modal2" onClick={e => e.stopPropagation()}>
        <div className="inv-modal2-header">
          <span className="inv-modal2-title">Send Estimate — {est.estimate_number}</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>
        <div className="inv-modal2-body">
          {result?.ok
            ? <div className="success-banner">✓ Estimate sent to {email}</div>
            : <>
                {result?.msg && <div className="error-banner">⚠ {result.msg}</div>}
                <div className="inv-field2">
                  <label>Send To</label>
                  <input className="inv-input2" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" />
                </div>
              </>
          }
        </div>
        <div className="inv-modal2-footer">
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button className="inv-btn2 inv-btn2--primary" onClick={send}
              disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : '✉️ Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Convert to Invoice Modal ──────────────────────────────────────────────────
function ConvertModal({ est, activeOrg, onClose, onDone, navigate }) {
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')

  async function convert() {
    setConverting(true)
    setError('')
    try {
      // Get next invoice number
      const { data: last } = await supabase
        .from('invoices').select('number').eq('org_id', activeOrg.orgId)
        .order('created_at', { ascending: false }).limit(1)
      const lastNum = last?.[0]?.number ? parseInt(last[0].number.replace(/\D/g, '')) || 0 : 0
      const newNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`

      // Create invoice
      const { data: newInv, error: invErr } = await supabase.from('invoices').insert({
        org_id:      activeOrg.orgId,
        customer_id: est.customer_id,
        number:      newNumber,
        date:        new Date().toISOString().split('T')[0],
        due_date:    est.expiry_date || null,
        status:      'draft',
        subtotal:    est.subtotal,
        tax:         est.tax,
        total:       est.total,
        notes:       est.notes || null,
        po_number:   est.po_number || null,
      }).select().single()
      if (invErr) throw invErr

      // Copy line items
      const lineItems = Array.isArray(est.line_items) ? est.line_items : []
      if (lineItems.length > 0) {
        await supabase.from('invoice_items').insert(
          lineItems.map(i => ({
            invoice_id:     newInv.id,
            org_id:         activeOrg.orgId,
            name:           i.name,
            quantity:       i.quantity,
            unit_price:     i.unit_price,
            discount_type:  i.discount_type || 'none',
            discount_value: i.discount_value || 0,
          }))
        )
      }

      // Archive estimate
      await supabase.from('estimates')
        .update({ status: 'converted', converted_invoice_id: newInv.id })
        .eq('id', est.id).eq('org_id', activeOrg.orgId)

      onDone()
      navigate(`/invoices/${newInv.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-modal2" onClick={e => e.stopPropagation()}>
        <div className="inv-modal2-header">
          <span className="inv-modal2-title">Convert to Invoice</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>
        <div className="inv-modal2-body">
          {error && <div className="error-banner">⚠ {error}</div>}
          <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
            This will create a new <strong>draft invoice</strong> from estimate <strong>{est.estimate_number}</strong> and archive the estimate.
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Estimate</span>
              <span style={{ fontWeight: 600 }}>{est.estimate_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Total</span>
              <span style={{ fontWeight: 700, color: '#0d7377' }}>{fmt(est.total)}</span>
            </div>
          </div>
        </div>
        <div className="inv-modal2-footer">
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>Cancel</button>
          <button className="inv-btn2 inv-btn2--primary" onClick={convert} disabled={converting}>
            {converting ? 'Converting…' : '🔄 Convert to Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Estimates() {
  const [estimates, setEstimates]     = useState([])
  const [filter, setFilter]           = useState('all')
  const [modal, setModal]             = useState(null)
  const [orgSettings, setOrgSettings] = useState(null)
  const navigate  = useNavigate()
  const location  = useLocation()
  const { activeOrg, isSuspended } = useOrg()

  useEffect(() => {
    if (activeOrg?.orgId) {
      fetchEstimates()
      fetchOrgSettings()
    }
  }, [location.key, activeOrg?.orgId])

  async function fetchEstimates() {
    if (!activeOrg?.orgId) return
    const { data, error } = await supabase
      .from('estimates')
      .select('*, customers(id, name, email, phone, address)')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setEstimates(data || [])
  }

  async function fetchOrgSettings() {
    const { data } = await supabase
      .from('organization_settings')
      .select('company_name, company_phone, gst_number')
      .eq('org_id', activeOrg.orgId)
      .single()
    setOrgSettings(data || null)
  }

  async function handleAction(action, est) {
    switch (action) {
      case 'view':
      case 'edit':
        navigate(`/estimates/${est.id}`)
        break
      case 'send':
        setModal({ type: 'send', est })
        break
      case 'approve':
        if (window.confirm(`Mark estimate ${est.estimate_number} as approved?`)) {
          await supabase.from('estimates').update({ status: 'approved' })
            .eq('id', est.id).eq('org_id', activeOrg.orgId)
          fetchEstimates()
        }
        break
      case 'decline':
        if (window.confirm(`Mark estimate ${est.estimate_number} as declined?`)) {
          await supabase.from('estimates').update({ status: 'declined' })
            .eq('id', est.id).eq('org_id', activeOrg.orgId)
          fetchEstimates()
        }
        break
      case 'convert':
        setModal({ type: 'convert', est })
        break
      case 'pdf':
        await exportEstimatePDF(est, est.customers, est.line_items || [], activeOrg.orgId)
        break
      case 'delete':
        if (window.confirm(`Delete estimate ${est.estimate_number}? This cannot be undone.`)) {
          await supabase.from('estimates').delete()
            .eq('id', est.id).eq('org_id', activeOrg.orgId)
          fetchEstimates()
        }
        break
    }
  }

  const filtered = estimates.filter(e => filter === 'all' ? true : e.status === filter)

  return (
    <>
      <style>{css}</style>
      <div className="inv-list-root">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Estimates</h1>
            <p className="text-sm text-gray-500">Create and manage quotes for your customers</p>
          </div>
          <button onClick={() => navigate('/estimates/new')} disabled={isSuspended} className="bg-black text-white px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
>
            + New Estimate
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {['all', 'draft', 'sent', 'approved', 'declined', 'converted'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-sm border capitalize ${
                filter === f ? 'bg-black text-white border-black' : 'bg-white border-gray-200'
              }`}>
              {f}
            </button>
          ))}
        </div>

        <SuspendedBanner />

        {/* Table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3 font-medium">Estimate #</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Expires</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(est => {
                const isExpired = est.expiry_date && new Date(est.expiry_date) < new Date() && !['converted','declined'].includes(est.status)
                const sc = statusColor(est.status)
                return (
                  <tr key={est.id}
                    className="border-t hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/estimates/${est.id}`)}>
                    <td className="p-3 font-medium text-gray-900">{est.estimate_number}</td>
                    <td className="p-3 text-gray-700">{est.customers?.name || '—'}</td>
                    <td className="p-3 text-gray-500">{fmtDate(est.issue_date)}</td>
                    <td className="p-3" style={{ color: isExpired ? '#dc2626' : '#64748b', fontWeight: isExpired ? 600 : 400 }}>
                      {est.expiry_date ? fmtDate(est.expiry_date) : '—'}
                      {isExpired && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td className="p-3">
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11,
                        fontWeight: 600, textTransform: 'capitalize',
                        background: sc.bg, color: sc.color
                      }}>
                        {est.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-gray-900">
                      {fmt(est.total || 0)}
                    </td>
                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                      <ActionMenu est={est} onAction={handleAction} isSuspended={isSuspended} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-gray-400 text-sm">
              No {filter === 'all' ? '' : filter + ' '}estimates found.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.type === 'send' && (
        <SendEstimateModal
          est={modal.est}
          customer={modal.est.customers}
          orgSettings={orgSettings}
          activeOrg={activeOrg}
          onClose={() => setModal(null)}
          onDone={fetchEstimates}
        />
      )}
      {modal?.type === 'convert' && (
        <ConvertModal
          est={modal.est}
          activeOrg={activeOrg}
          onClose={() => setModal(null)}
          onDone={fetchEstimates}
          navigate={navigate}
        />
      )}
    </>
  )
}
