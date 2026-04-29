// src/pages/Invoices.jsx
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'
import { exportInvoicePDF } from '../utils/exportInvoicePDF'

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
    case 'paid':  return { bg: '#dcfce7', color: '#15803d' }
    case 'sent':  return { bg: '#dbeafe', color: '#1d4ed8' }
    case 'void':  return { bg: '#fee2e2', color: '#dc2626' }
    case 'partial': return { bg: '#fef9c3', color: '#a16207' }
    default:      return { bg: '#f1f5f9', color: '#64748b' }
  }
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  .inv-list-root { font-family: 'DM Sans', system-ui, sans-serif; }

  /* Action dropdown */
  .act-wrap { position: relative; }

  .act-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    border-radius: 7px;
    border: 1.5px solid #e2e8f0;
    background: white;
    cursor: pointer;
    color: #64748b;
    font-size: 16px;
    line-height: 1;
    transition: all .15s;
  }
  .act-btn:hover { background: #f1f5f9; border-color: #cbd5e1; color: #1e293b; }

  .act-menu {
    position: fixed;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
    border: 1px solid #e2e8f0;
    min-width: 190px;
    z-index: 1000;
    overflow: hidden;
    animation: actFadeIn .12s ease;
  }
  @keyframes actFadeIn {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }

  .act-group { padding: 4px 0; }
  .act-group + .act-group { border-top: 1px solid #f1f5f9; }

  .act-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 9px 14px;
    background: none;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #334155;
    cursor: pointer;
    text-align: left;
    transition: background .1s;
  }
  .act-item:hover { background: #f8fafc; }
  .act-item--danger { color: #dc2626; }
  .act-item--danger:hover { background: #fff5f5; }
  .act-item-icon { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }

  /* Modal overlay */
  .inv-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 2000; padding: 16px;
    backdrop-filter: blur(2px);
  }
  .inv-modal2 {
    background: white; border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.18);
    width: 100%; max-width: 440px;
    max-height: 90vh; display: flex; flex-direction: column;
    overflow: hidden;
  }
  .inv-modal2-header {
    background: linear-gradient(135deg, #1e293b 0%, #2d3f55 100%);
    padding: 18px 22px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .inv-modal2-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 16px; font-weight: 600; color: white;
  }
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

  /* Form fields */
  .inv-field2 { display: flex; flex-direction: column; gap: 5px; }
  .inv-field2 label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: #94a3b8;
  }
  .inv-input2 {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: #1e293b;
    background: white; border: 1.5px solid #e2e8f0; border-radius: 8px;
    padding: 8px 11px; outline: none; transition: border-color .15s, box-shadow .15s;
    width: 100%;
  }
  .inv-input2:focus { border-color: #0d7377; box-shadow: 0 0 0 3px rgba(13,115,119,0.1); }

  .inv-select2 {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center;
    padding-right: 28px; cursor: pointer;
  }

  /* Buttons */
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

  /* Payment history */
  .pay-history { display: flex; flex-direction: column; gap: 6px; }
  .pay-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; background: #f8fafc; border-radius: 8px;
    border: 1px solid #e2e8f0; font-size: 13px;
  }
  .pay-row-left { display: flex; flex-direction: column; gap: 2px; }
  .pay-row-method { font-size: 11px; color: #94a3b8; text-transform: capitalize; }
  .pay-row-amount { font-weight: 600; color: #0d7377; }

  /* Balance strip */
  .balance-strip {
    display: flex; justify-content: space-between; align-items: center;
    background: #e8f5f5; border: 1px solid #b2e0e2;
    border-radius: 10px; padding: 12px 16px; font-size: 13px;
  }
  .balance-strip-label { color: #0d7377; font-weight: 500; }
  .balance-strip-amount { font-size: 18px; font-weight: 700; color: #0d7377; }

  /* Reminder modal specifics */
  .reminder-option {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px; border-radius: 10px; border: 1.5px solid #e2e8f0;
    cursor: pointer; transition: all .15s;
  }
  .reminder-option:hover { border-color: #0d7377; background: #f0fdfe; }
  .reminder-option.selected { border-color: #0d7377; background: #e8f5f5; }
  .reminder-option-radio {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #e2e8f0; flex-shrink: 0; margin-top: 1px;
    display: flex; align-items: center; justify-content: center;
    transition: border-color .15s;
  }
  .reminder-option.selected .reminder-option-radio {
    border-color: #0d7377; background: #0d7377;
  }
  .reminder-option.selected .reminder-option-radio::after {
    content: ''; width: 6px; height: 6px; border-radius: 50%; background: white;
  }
  .reminder-option-text strong { font-size: 13px; color: #1e293b; display: block; margin-bottom: 2px; }
  .reminder-option-text span { font-size: 12px; color: #64748b; }

  .success-banner {
    display: flex; align-items: center; gap: 10px;
    background: #e8f5f5; border: 1px solid #b2e0e2;
    border-radius: 10px; padding: 14px 16px;
    font-size: 13px; color: #0d7377; font-weight: 500;
  }
  .error-banner {
    background: #fff5f5; border: 1px solid #fecaca;
    border-radius: 10px; padding: 12px 16px;
    font-size: 13px; color: #dc2626;
  }

  /* Overdue row highlight */
  tr.overdue-row td:first-child { border-left: 3px solid #f97316; }
`

// ── Action Dropdown ───────────────────────────────────────────────────────────
function ActionMenu({ inv, onAction }) {
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
    onAction(action, inv)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status === 'sent'

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
            <button className="act-item" onClick={e => pick('edit', e)}>
              <span className="act-item-icon">✏️</span> Edit
            </button>
            <button className="act-item" onClick={e => pick('duplicate', e)}>
              <span className="act-item-icon">⧉</span> Duplicate
            </button>
          </div>
          <div className="act-group">
            <button className="act-item" onClick={e => pick('payment', e)}>
              <span className="act-item-icon">💳</span> Record Payment
            </button>
            <button className="act-item" onClick={e => pick('resend', e)}>
              <span className="act-item-icon">✉️</span> Resend Invoice
            </button>
            {(inv.status === 'sent' || isOverdue) && (
              <button className="act-item" onClick={e => pick('reminder', e)}>
                <span className="act-item-icon">🔔</span> Send Reminder
                {isOverdue && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f97316', fontWeight: 600 }}>OVERDUE</span>}
              </button>
            )}
          </div>
          <div className="act-group">
            <button className="act-item" onClick={e => pick('pdf', e)}>
              <span className="act-item-icon">↓</span> Export as PDF
            </button>
          </div>
          <div className="act-group">
            {inv.status !== 'void' && (
              <button className="act-item act-item--danger" onClick={e => pick('void', e)}>
                <span className="act-item-icon">⊘</span> Void Invoice
              </button>
            )}
            <button className="act-item act-item--danger" onClick={e => pick('delete', e)}>
              <span className="act-item-icon">🗑</span> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function PaymentModal({ inv, orgId, onClose, onDone }) {
  const [amount, setAmount]     = useState('')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod]     = useState('e-transfer')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [history, setHistory]   = useState([])
  const [loadingH, setLoadingH] = useState(true)

  const totalPaid    = history.reduce((s, p) => s + Number(p.amount), 0)
  const balance      = Number(inv.total || 0) - totalPaid
  const isFullyPaid  = balance <= 0.005

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    setLoadingH(true)
    const { data } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('payment_date', { ascending: false })
    setHistory(data || [])
    setLoadingH(false)
  }

  async function save() {
    if (!amount || Number(amount) <= 0) return
    setSaving(true)
    try {
      await supabase.from('invoice_payments').insert({
        invoice_id:   inv.id,
        org_id:       orgId,
        amount:       Number(amount),
        payment_date: date,
        method,
        note: note || null,
      })

      // Update invoice status
      const newPaid = totalPaid + Number(amount)
      const newStatus = newPaid >= Number(inv.total) - 0.005 ? 'paid' : 'partial'
      await supabase.from('invoices')
        .update({ status: newStatus })
        .eq('id', inv.id).eq('org_id', orgId)

      await fetchHistory()
      setAmount('')
      setNote('')
      onDone()
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-modal2" onClick={e => e.stopPropagation()}>
        <div className="inv-modal2-header">
          <span className="inv-modal2-title">Record Payment — {inv.number}</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>
        <div className="inv-modal2-body">
          {/* Balance */}
          <div className="balance-strip">
            <span className="balance-strip-label">
              {isFullyPaid ? '✓ Fully Paid' : 'Balance Remaining'}
            </span>
            <span className="balance-strip-amount">{fmt(Math.max(balance, 0))}</span>
          </div>

          {/* Payment history */}
          {!loadingH && history.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
                Payment History
              </div>
              <div className="pay-history">
                {history.map(p => (
                  <div key={p.id} className="pay-row">
                    <div className="pay-row-left">
                      <span style={{ fontSize: 13, color: '#1e293b' }}>{fmtDate(p.payment_date)}</span>
                      <span className="pay-row-method">{p.method}{p.note ? ` · ${p.note}` : ''}</span>
                    </div>
                    <span className="pay-row-amount">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New payment form */}
          {!isFullyPaid && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
                New Payment
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="inv-field2">
                  <label>Amount (CAD)</label>
                  <input className="inv-input2" type="number" min="0" step="0.01"
                    placeholder={fmt(balance)}
                    value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="inv-field2">
                  <label>Date</label>
                  <input className="inv-input2" type="date" value={date}
                    onChange={e => setDate(e.target.value)} />
                </div>
              </div>
              <div className="inv-field2">
                <label>Payment Method</label>
                <select className="inv-input2 inv-select2" value={method}
                  onChange={e => setMethod(e.target.value)}>
                  <option value="e-transfer">E-Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="credit-card">Credit Card</option>
                  <option value="bank-transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="inv-field2">
                <label>Note (optional)</label>
                <input className="inv-input2" type="text" placeholder="e.g. Deposit, cheque #1234"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {/* Quick amount buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[balance * 0.5, balance * 0.25, balance].map((v, i) => (
                  <button key={i} className="inv-btn2" style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => setAmount(v.toFixed(2))}>
                    {i === 0 ? '50%' : i === 1 ? '25%' : 'Full'} ({fmt(v)})
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="inv-modal2-footer">
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>Close</button>
          {!isFullyPaid && (
            <button className="inv-btn2 inv-btn2--primary" onClick={save}
              disabled={saving || !amount || Number(amount) <= 0}>
              {saving ? 'Saving…' : '💳 Record Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reminder Modal ────────────────────────────────────────────────────────────
function ReminderModal({ inv, customer, orgSettings, activeOrg, onClose }) {
  const [mode, setMode]         = useState('now') // 'now' | 'schedule'
  const [schedDate, setSchedDate] = useState(inv.due_date || '')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState(null)

  async function send() {
    setSending(true)
    setResult(null)
    try {
      const email = customer?.email
      if (!email) throw new Error('No email on file for this customer')

      if (mode === 'schedule') {
        // Save to DB for scheduled send
        await supabase.from('invoice_reminders').insert({
          invoice_id:    inv.id,
          org_id:        activeOrg.orgId,
          send_at:       schedDate,
          status:        'pending',
        })
        setResult({ ok: true, msg: `Reminder scheduled for ${fmtDate(schedDate)}` })
        return
      }

      // Send now via edge function
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
          <div style="background:#1e293b;padding:24px 28px;border-radius:12px 12px 0 0;">
            <h2 style="color:white;margin:0;font-size:18px;">Payment Reminder</h2>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">Invoice ${inv.number}</p>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
            <p style="font-size:15px;margin:0 0 14px;">Hi ${customer?.name || 'there'},</p>
            <p style="font-size:14px;color:#475569;margin:0 0 16px;">
              This is a friendly reminder that invoice <strong>${inv.number}</strong> 
              for <strong>${fmt(inv.total)}</strong> 
              ${inv.due_date ? `was due on <strong>${fmtDate(inv.due_date)}</strong>` : 'is outstanding'} 
              and remains unpaid.
            </p>
            <p style="font-size:14px;color:#475569;margin:0;">
              Please arrange payment at your earliest convenience. Contact us if you have any questions.
            </p>
            ${orgSettings?.company_phone ? `<p style="font-size:13px;color:#94a3b8;margin-top:16px;">${orgSettings.company_name || ''} · ${orgSettings.company_phone}</p>` : ''}
          </div>
        </div>
      `

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to:      email,
            subject: `Payment Reminder: Invoice ${inv.number}`,
            html,
            pdfBase64: null,
            filename:  null,
          })
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data.error))

      // Mark reminder sent
      await supabase.from('invoices')
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq('id', inv.id)

      setResult({ ok: true, msg: `Reminder sent to ${email}` })
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
          <span className="inv-modal2-title">Send Reminder — {inv.number}</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>
        <div className="inv-modal2-body">
          {result ? (
            result.ok
              ? <div className="success-banner">✓ {result.msg}</div>
              : <div className="error-banner">⚠ {result.msg}</div>
          ) : null}

          {!result?.ok && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>To</span>
                  <span style={{ fontWeight: 600 }}>{customer?.email || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Invoice</span>
                  <span style={{ fontWeight: 600 }}>{inv.number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Amount Due</span>
                  <span style={{ fontWeight: 700, color: '#0d7377' }}>{fmt(inv.total)}</span>
                </div>
                {inv.due_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Due Date</span>
                    <span style={{ fontWeight: 500, color: new Date(inv.due_date) < new Date() ? '#dc2626' : '#1e293b' }}>
                      {fmtDate(inv.due_date)}
                      {new Date(inv.due_date) < new Date() ? ' · OVERDUE' : ''}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className={`reminder-option ${mode === 'now' ? 'selected' : ''}`}
                  onClick={() => setMode('now')}>
                  <div className="reminder-option-radio" />
                  <div className="reminder-option-text">
                    <strong>Send Now</strong>
                    <span>Email reminder sent immediately</span>
                  </div>
                </div>
                <div className={`reminder-option ${mode === 'schedule' ? 'selected' : ''}`}
                  onClick={() => setMode('schedule')}>
                  <div className="reminder-option-radio" />
                  <div className="reminder-option-text">
                    <strong>Schedule for Later</strong>
                    <span>Queue reminder for a specific date</span>
                  </div>
                </div>
              </div>

              {mode === 'schedule' && (
                <div className="inv-field2">
                  <label>Send On</label>
                  <input className="inv-input2" type="date" value={schedDate}
                    onChange={e => setSchedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="inv-modal2-footer">
          <button className="inv-btn2 inv-btn2--ghost" onClick={onClose}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button className="inv-btn2 inv-btn2--primary" onClick={send}
              disabled={sending || (mode === 'schedule' && !schedDate)}>
              {sending ? 'Sending…' : mode === 'now' ? '🔔 Send Now' : '📅 Schedule'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Resend Modal ──────────────────────────────────────────────────────────────
function ResendModal({ inv, customer, orgSettings, activeOrg, onClose }) {
  const [email, setEmail]   = useState(customer?.email || '')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  async function send() {
    if (!email.trim()) return
    setSending(true)
    try {
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1e293b;padding:24px 28px;border-radius:12px 12px 0 0;">
            <h2 style="color:white;margin:0;">Invoice ${inv.number}</h2>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:13px;">
              From ${orgSettings?.company_name || ''}
            </p>
          </div>
          <div style="background:#f8fafc;padding:24px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
            <p>Hi ${customer?.name || 'there'},</p>
            <p style="color:#475569;">Please find your invoice attached for ${fmt(inv.total)}${inv.due_date ? `, due ${fmtDate(inv.due_date)}` : ''}.</p>
          </div>
        </div>
      `
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ to: email.trim(), subject: `Invoice ${inv.number}`, html, pdfBase64: null, filename: null })
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Send failed')
      setResult({ ok: true })
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
          <span className="inv-modal2-title">Resend Invoice — {inv.number}</span>
          <button className="inv-modal2-close" onClick={onClose}>×</button>
        </div>
        <div className="inv-modal2-body">
          {result?.ok
            ? <div className="success-banner">✓ Invoice resent to {email}</div>
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
              {sending ? 'Sending…' : '✉️ Resend'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Invoices() {
  const [invoices, setInvoices]       = useState([])
  const [filter, setFilter]           = useState('all')
  const [modal, setModal]             = useState(null) // { type, inv }
  const [customers, setCustomers]     = useState({})
  const [orgSettings, setOrgSettings] = useState(null)
  const navigate  = useNavigate()
  const location  = useLocation()
  const { activeOrg } = useOrg()

  useEffect(() => {
    if (activeOrg?.orgId) {
      fetchInvoices()
      fetchOrgSettings()
    }
  }, [location.key, activeOrg?.orgId])

  async function fetchInvoices() {
    if (!activeOrg?.orgId) return
    const { data, error } = await supabase
      .from('invoices')
      .select('*, customers(id, name, email, phone, address)')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setInvoices(data || [])
  }

  async function fetchOrgSettings() {
    const { data } = await supabase
      .from('organization_settings')
      .select('company_name, company_phone, gst_number')
      .eq('org_id', activeOrg.orgId)
      .single()
    setOrgSettings(data || null)
  }

  async function handleAction(action, inv) {
    switch (action) {
      case 'view':
        navigate(`/invoices/${inv.id}`)
        break
      case 'edit':
        navigate(`/invoices/${inv.id}`)
        break
      case 'duplicate':
        await duplicateInvoice(inv)
        break
      case 'payment':
        setModal({ type: 'payment', inv })
        break
      case 'resend':
        setModal({ type: 'resend', inv })
        break
      case 'reminder':
        setModal({ type: 'reminder', inv })
        break
      case 'pdf':
        await exportInvoicePDF(inv, inv.customers, [], activeOrg.orgId)
        break
      case 'void':
        if (window.confirm(`Void invoice ${inv.number}?`)) {
          await supabase.from('invoices').update({ status: 'void' }).eq('id', inv.id).eq('org_id', activeOrg.orgId)
          fetchInvoices()
        }
        break
      case 'delete':
        if (window.confirm(`Delete invoice ${inv.number}? This cannot be undone.`)) {
          await supabase.from('invoices').delete().eq('id', inv.id).eq('org_id', activeOrg.orgId)
          fetchInvoices()
        }
        break
    }
  }

  async function duplicateInvoice(inv) {
    const { data: last } = await supabase
      .from('invoices').select('number').eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false }).limit(1)
    const lastNum = last?.[0]?.number ? parseInt(last[0].number.replace(/\D/g, '')) || 0 : 0
    const newNumber = String(lastNum + 1).padStart(3, '0')

    const { data: newInv, error } = await supabase.from('invoices').insert({
      org_id: activeOrg.orgId, customer_id: inv.customer_id, number: newNumber,
      date: new Date().toISOString().split('T')[0], due_date: inv.due_date || null,
      status: 'draft', subtotal: inv.subtotal, tax: inv.tax, total: inv.total, notes: inv.notes || null,
    }).select().single()
    if (error) { alert('Duplicate failed: ' + error.message); return }

    const { data: srcItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id)
    if (srcItems?.length) {
      await supabase.from('invoice_items').insert(srcItems.map(i => ({
        invoice_id: newInv.id, org_id: activeOrg.orgId,
        name: i.name, quantity: i.quantity, unit_price: i.unit_price,
        discount_type: i.discount_type || 'none', discount_value: i.discount_value || 0,
      })))
    }
    navigate(`/invoices/${newInv.id}`)
  }

  const filtered = invoices.filter(inv => filter === 'all' ? true : inv.status === filter)
  const activeModal = modal

  return (
    <>
      <style>{css}</style>
      <div className="inv-list-root">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Invoices</h1>
            <p className="text-sm text-gray-500">Manage all your invoices</p>
          </div>
          <button onClick={() => navigate('/invoices/new')} className="bg-black text-white px-4 py-2 rounded-xl">
            + New Invoice
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {['all', 'draft', 'sent', 'partial', 'paid', 'void'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-sm border capitalize ${
                filter === f ? 'bg-black text-white border-black' : 'bg-white border-gray-200'
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3 font-medium">Invoice</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Due</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status === 'sent'
                const sc = statusColor(inv.status)
                return (
                  <tr key={inv.id}
                    className={`border-t hover:bg-gray-50 cursor-pointer transition-colors${isOverdue ? ' overdue-row' : ''}`}
                    onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="p-3 font-medium text-gray-900">{inv.number}</td>
                    <td className="p-3 text-gray-700">{inv.customers?.name || '—'}</td>
                    <td className="p-3 text-gray-500">{fmtDate(inv.date)}</td>
                    <td className="p-3" style={{ color: isOverdue ? '#dc2626' : '#64748b', fontWeight: isOverdue ? 600 : 400 }}>
                      {inv.due_date ? fmtDate(inv.due_date) : '—'}
                      {isOverdue && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td className="p-3">
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11,
                        fontWeight: 600, textTransform: 'capitalize',
                        background: sc.bg, color: sc.color
                      }}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-gray-900">
                      {fmt(inv.total || 0)}
                    </td>
                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                      <ActionMenu inv={inv} onAction={handleAction} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-gray-400 text-sm">
              No {filter === 'all' ? '' : filter + ' '}invoices found.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {activeModal?.type === 'payment' && (
        <PaymentModal
          inv={activeModal.inv}
          orgId={activeOrg.orgId}
          onClose={() => setModal(null)}
          onDone={fetchInvoices}
        />
      )}
      {activeModal?.type === 'reminder' && (
        <ReminderModal
          inv={activeModal.inv}
          customer={activeModal.inv.customers}
          orgSettings={orgSettings}
          activeOrg={activeOrg}
          onClose={() => setModal(null)}
        />
      )}
      {activeModal?.type === 'resend' && (
        <ResendModal
          inv={activeModal.inv}
          customer={activeModal.inv.customers}
          orgSettings={orgSettings}
          activeOrg={activeOrg}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
