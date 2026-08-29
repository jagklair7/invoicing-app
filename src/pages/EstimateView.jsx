// src/pages/EstimateView.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { exportEstimatePDF } from '../utils/exportEstimatePDF'
import SuspendedBanner from '../components/SuspendedBanner'

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

function statusColor(status) {
  switch (status) {
    case 'approved':  return { bg: '#dcfce7', color: '#15803d' }
    case 'sent':      return { bg: '#dbeafe', color: '#1d4ed8' }
    case 'declined':  return { bg: '#fee2e2', color: '#dc2626' }
    case 'converted': return { bg: '#f3e8ff', color: '#7c3aed' }
    default:          return { bg: '#f1f5f9', color: '#64748b' }
  }
}

const css = `
  .ev-root { font-family: 'DM Sans', system-ui, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px; }

  .ev-card {
    background: white; border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    overflow: hidden; margin-bottom: 16px;
  }
  .ev-card-header {
    padding: 16px 20px; border-bottom: 1px solid #f1f5f9;
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: #94a3b8;
  }
  .ev-card-body { padding: 20px; }

  .ev-meta-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;
  }
  .ev-meta-item { display: flex; flex-direction: column; gap: 3px; }
  .ev-meta-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }
  .ev-meta-value { font-size: 14px; color: #1e293b; font-weight: 500; }

  /* Line items table */
  .ev-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ev-table th {
    text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8;
    background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  }
  .ev-table th.right, .ev-table td.right { text-align: right; }
  .ev-table td { padding: 10px; border-bottom: 1px solid #f8fafc; color: #334155; }
  .ev-table tr:last-child td { border-bottom: none; }
  .ev-table tr:hover td { background: #fafafa; }

  /* Totals */
  .ev-totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 16px 20px; border-top: 1px solid #f1f5f9; }
  .ev-total-row { display: flex; gap: 48px; font-size: 13px; }
  .ev-total-label { color: #94a3b8; min-width: 80px; text-align: right; }
  .ev-total-value { color: #1e293b; min-width: 80px; text-align: right; }
  .ev-grand-row {
    display: flex; gap: 48px; font-size: 16px; font-weight: 700;
    color: #0d7377; background: #e8f5f5; padding: 10px 16px;
    border-radius: 10px; margin-top: 4px;
  }

  /* Action bar */
  .ev-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .ev-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 500;
    font-family: 'DM Sans', sans-serif; border: 1.5px solid #e2e8f0;
    background: white; color: #64748b; cursor: pointer; transition: all .15s;
  }
  .ev-btn:hover { border-color: #94a3b8; color: #1e293b; }
  .ev-btn--primary { background: #0d7377; color: white; border-color: #0d7377; }
  .ev-btn--primary:hover { background: #14a0a5; border-color: #14a0a5; color: white; }
  .ev-btn--success { background: #15803d; color: white; border-color: #15803d; }
  .ev-btn--success:hover { background: #16a34a; border-color: #16a34a; color: white; }
  .ev-btn--purple { background: #7c3aed; color: white; border-color: #7c3aed; }
  .ev-btn--purple:hover { background: #6d28d9; border-color: #6d28d9; color: white; }
  .ev-btn--danger { color: #dc2626; border-color: #fecaca; }
  .ev-btn--danger:hover { background: #fff5f5; }
  .ev-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Modal */
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
  .inv-field2 label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; }
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
    border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #0d7377; font-weight: 500;
  }
  .error-banner {
    background: #fff5f5; border: 1px solid #fecaca;
    border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #dc2626;
  }
`

// ── Send Modal ────────────────────────────────────────────────────────────────
function SendModal({ est, customer, orgSettings, activeOrg, onClose, onDone }) {
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
              for <strong>${fmt(est.total)}</strong>.
              ${est.expiry_date ? `This estimate is valid until <strong>${fmtDate(est.expiry_date)}</strong>.` : ''}
            </p>
            <a href="mailto:info@klair.ca"
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            to: email.trim(),
            subject: `Estimate ${est.estimate_number} from ${orgSettings?.company_name || ''}`,
            html, pdfBase64: '', filename: `estimate-${est.estimate_number}.pdf`,
          })
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Send failed')

      await supabase.from('estimates').update({ status: 'sent' })
        .eq('id', est.id).eq('org_id', activeOrg.orgId)

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
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</button>
          {!result?.ok && (
            <button className="inv-btn2 inv-btn2--primary" onClick={send} disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : '✉️ Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Convert Modal ─────────────────────────────────────────────────────────────
function ConvertModal({ est, activeOrg, onClose, navigate }) {
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')

  async function convert() {
    setConverting(true)
    setError('')
    try {
      const { data: last } = await supabase
        .from('invoices').select('number').eq('org_id', activeOrg.orgId)
        .order('created_at', { ascending: false }).limit(1)
      const lastNum = last?.[0]?.number ? parseInt(last[0].number.replace(/\D/g, '')) || 0 : 0
      const newNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`

      const { data: newInv, error: invErr } = await supabase.from('invoices').insert({
        org_id: activeOrg.orgId, customer_id: est.customer_id, number: newNumber,
        date: new Date().toISOString().split('T')[0], due_date: est.expiry_date || null,
        status: 'draft', subtotal: est.subtotal, tax: est.tax, total: est.total,
        notes: est.notes || null, po_number: est.po_number || null,
      }).select().single()
      if (invErr) throw invErr

      const lineItems = Array.isArray(est.line_items) ? est.line_items : []
      if (lineItems.length > 0) {
        await supabase.from('invoice_items').insert(
          lineItems.map(i => ({
            invoice_id: newInv.id, org_id: activeOrg.orgId,
            name: i.name, quantity: i.quantity, unit_price: i.unit_price,
            discount_type: i.discount_type || 'none', discount_value: i.discount_value || 0,
          }))
        )
      }

      await supabase.from('estimates')
        .update({ status: 'converted', converted_invoice_id: newInv.id })
        .eq('id', est.id).eq('org_id', activeOrg.orgId)

      navigate(`/invoices/${newInv.id}`)
    } catch (err) {
      setError(err.message)
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EstimateView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrg, isSuspended } = useOrg()

  const [estimate, setEstimate]     = useState(null)
  const [customer, setCustomer]     = useState(null)
  const [orgSettings, setOrgSettings] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    if (activeOrg?.orgId && id) load()
  }, [id, activeOrg?.orgId])

  async function load() {
    setLoading(true)
    const [{ data: est }, { data: settings }] = await Promise.all([
      supabase.from('estimates').select('*, customers(*)').eq('id', id).eq('org_id', activeOrg.orgId).single(),
      supabase.from('organization_settings').select('*').eq('org_id', activeOrg.orgId).single(),
    ])
    if (!est) { navigate('/estimates'); return }
    setEstimate(est)
    setCustomer(est.customers || null)
    setOrgSettings(settings || null)
    setLoading(false)
  }

  async function updateStatus(status) {
    setActionLoading(status)
    await supabase.from('estimates').update({ status }).eq('id', id).eq('org_id', activeOrg.orgId)
    await load()
    setActionLoading('')
  }

  async function handleDelete() {
    if (!window.confirm('Delete this estimate? This cannot be undone.')) return
    await supabase.from('estimates').delete().eq('id', id).eq('org_id', activeOrg.orgId)
    navigate('/estimates')
  }

  async function handleExportPDF() {
    await exportEstimatePDF(estimate, customer, estimate.line_items || [], activeOrg.orgId)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!estimate) return null

  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : []
  const sc = statusColor(estimate.status)
  const isExpired = estimate.expiry_date && new Date(estimate.expiry_date) < new Date()
    && !['converted', 'declined'].includes(estimate.status)

  return (
    <>
      <style>{css}</style>
      <div className="ev-root">
        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => navigate('/estimates')}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
            ← Estimates
          </button>
          <span style={{ color: '#e2e8f0' }}>|</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>
            {estimate.estimate_number}
          </h1>
          <span style={{
            padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            textTransform: 'capitalize', background: sc.bg, color: sc.color
          }}>
            {estimate.status}
          </span>
          {isExpired && (
            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fff7ed', color: '#f97316' }}>
              EXPIRED
            </span>
          )}
        </div>

           <SuspendedBanner />

        {/* Action buttons */}
        <div className="ev-actions">
          <button className="ev-btn" onClick={() => navigate(`/estimates/${id}/edit`)} disabled={isSuspended}>
            ✏️ Edit
          </button>
          {!['converted', 'declined'].includes(estimate.status) && (
            <button className="ev-btn ev-btn--primary" onClick={() => setModal('send')} disabled={isSuspended}>
              ✉️ Send Estimate
            </button>
          )}
          {['draft', 'sent'].includes(estimate.status) && (
            <button className="ev-btn ev-btn--success"
              onClick={() => updateStatus('approved')}
              disabled={actionLoading === 'approved' || isSuspended}>
              ✅ {actionLoading === 'approved' ? 'Updating…' : 'Mark Approved'}
            </button>
          )}
          {estimate.status === 'approved' && (
            <button className="ev-btn ev-btn--purple" onClick={() => setModal('convert')} disabled={isSuspended}>
              🔄 Convert to Invoice
            </button>
          )}
          {['draft', 'sent'].includes(estimate.status) && (
            <button className="ev-btn"
              onClick={() => updateStatus('declined')}
              disabled={actionLoading === 'declined' || isSuspended}>
              ❌ {actionLoading === 'declined' ? 'Updating…' : 'Mark Declined'}
            </button>
          )}
          <button className="ev-btn" onClick={handleExportPDF} disabled={isSuspended}>
            ↓ Export PDF
          </button>
          <button className="ev-btn ev-btn--danger" onClick={handleDelete} disabled={isSuspended}>
            🗑 Delete
          </button>
        </div>

        {/* Converted notice */}
        {estimate.status === 'converted' && estimate.converted_invoice_id && (
          <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#7c3aed', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🔄 This estimate has been converted to an invoice.</span>
            <button onClick={() => navigate(`/invoices/${estimate.converted_invoice_id}`)}
              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              View Invoice →
            </button>
          </div>
        )}

        {/* Meta */}
        <div className="ev-card">
          <div className="ev-card-header">Estimate Details</div>
          <div className="ev-card-body">
            <div className="ev-meta-grid">
              <div className="ev-meta-item">
                <span className="ev-meta-label">Customer</span>
                <span className="ev-meta-value">{customer?.name || '—'}</span>
              </div>
              <div className="ev-meta-item">
                <span className="ev-meta-label">Issue Date</span>
                <span className="ev-meta-value">{fmtDate(estimate.issue_date)}</span>
              </div>
              <div className="ev-meta-item">
                <span className="ev-meta-label">Expiry Date</span>
                <span className="ev-meta-value" style={{ color: isExpired ? '#dc2626' : undefined }}>
                  {estimate.expiry_date ? fmtDate(estimate.expiry_date) : '—'}
                  {isExpired ? ' · Expired' : ''}
                </span>
              </div>
              {estimate.po_number && (
                <div className="ev-meta-item">
                  <span className="ev-meta-label">PO Number</span>
                  <span className="ev-meta-value">{estimate.po_number}</span>
                </div>
              )}
              {customer?.email && (
                <div className="ev-meta-item">
                  <span className="ev-meta-label">Email</span>
                  <span className="ev-meta-value">{customer.email}</span>
                </div>
              )}
              {customer?.phone && (
                <div className="ev-meta-item">
                  <span className="ev-meta-label">Phone</span>
                  <span className="ev-meta-value">{customer.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="ev-card">
          <div className="ev-card-header">Line Items</div>
          <table className="ev-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="right">Qty</th>
                <th className="right">Unit Price</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0
                ? <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No line items</td></tr>
                : lineItems.map((item, i) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
                    return (
                      <tr key={i}>
                        <td>{item.name}</td>
                        <td className="right">{item.quantity}</td>
                        <td className="right">{fmt(item.unit_price)}</td>
                        <td className="right" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
          <div className="ev-totals">
            <div className="ev-total-row">
              <span className="ev-total-label">Subtotal</span>
              <span className="ev-total-value">{fmt(estimate.subtotal)}</span>
            </div>
            <div className="ev-total-row">
              <span className="ev-total-label">Tax (5%)</span>
              <span className="ev-total-value">{fmt(estimate.tax)}</span>
            </div>
            <div className="ev-grand-row">
              <span>Total</span>
              <span>{fmt(estimate.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {estimate.notes && (
          <div className="ev-card">
            <div className="ev-card-header">Notes</div>
            <div className="ev-card-body" style={{ fontSize: 13, color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {estimate.notes}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'send' && (
        <SendModal
          est={estimate} customer={customer} orgSettings={orgSettings}
          activeOrg={activeOrg} onClose={() => setModal(null)} onDone={load}
        />
      )}
      {modal === 'convert' && (
        <ConvertModal
          est={estimate} activeOrg={activeOrg}
          onClose={() => setModal(null)} navigate={navigate}
        />
      )}
    </>
  )
}
