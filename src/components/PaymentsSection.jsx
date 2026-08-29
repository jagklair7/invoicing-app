/**
 * components/PaymentsSection.jsx
 *
 * Displays recorded payments on an invoice and allows adding new ones.
 * Matches the InvoiceView inv-* CSS design system exactly.
 *
 * Props:
 *   invoiceId    — invoice UUID
 *   invoiceTotal — total amount due (for balance calculation)
 *   orgId        — active org ID
 *   invoice      — full invoice object (needed for receipt PDF: number, total, id)
 *   customer     — full customer object (needed for receipt PDF: name, email, phone)
 *   onPaymentAdded(payment) — called after a payment is saved
 *   onPaymentDeleted(paymentId) — called after a payment is removed
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../app/supabaseClient'
import { sendReceipt } from '../utils/sendReceipt'

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : '—'

const METHOD_LABELS = {
  card:       '💳 Card',
  cash:       '💵 Cash',
  cheque:     '📄 Cheque',
  etransfer:  '📧 e-Transfer',
  other:      '• Other',
}

const css = `
  .pay-section {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1.5px solid #e2e8f0;
  }

  .pay-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .pay-section-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #0d7377;
  }

  .pay-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    background: #e8f5f5;
    border: 1.5px dashed #b2e0e2;
    color: #0d7377;
    cursor: pointer;
    transition: all .15s;
  }
  .pay-add-btn:hover { background: #d0eeef; border-color: #0d7377; }

  /* Payment list */
  .pay-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .pay-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .pay-item-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #0d7377;
    margin-top: 5px;
    flex-shrink: 0;
  }

  .pay-item-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .pay-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .pay-item-method {
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
  }

  .pay-item-amount-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pay-item-amount {
    font-size: 14px;
    font-weight: 600;
    color: #0d7377;
    font-variant-numeric: tabular-nums;
  }

  .pay-item-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    transition: all .15s;
  }
  .pay-item-delete:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }
  .pay-item-delete:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pay-item-meta {
    font-size: 11px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pay-item-notes {
    font-size: 12px;
    color: #475569;
    margin-top: 4px;
    font-style: italic;
    line-height: 1.5;
  }

  .pay-item-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
  }

  .pay-item-receipt-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    background: transparent;
    border: 1px solid #b2e0e2;
    color: #0d7377;
    cursor: pointer;
    transition: all .15s;
  }
  .pay-item-receipt-btn:hover { background: #e8f5f5; }
  .pay-item-receipt-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pay-item-receipt-sent {
    font-size: 11px;
    color: #059669;
  }

  .pay-item-receipt-error {
    font-size: 11px;
    color: #dc2626;
  }

  /* Balance row */
  .pay-balance {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    padding: 12px 16px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
  }

  .pay-balance-row {
    display: flex;
    gap: 48px;
    align-items: baseline;
  }

  .pay-balance-label {
    font-size: 12px;
    color: #94a3b8;
    min-width: 100px;
    text-align: right;
  }

  .pay-balance-value {
    font-size: 13px;
    color: #475569;
    min-width: 90px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .pay-balance-row--due .pay-balance-label {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
  }

  .pay-balance-row--due .pay-balance-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 600;
    color: #e53e3e;
  }

  .pay-balance-row--due .pay-balance-value--paid {
    color: #059669;
  }

  /* Form */
  .pay-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: #f0fdfe;
    border: 1.5px solid #b2e0e2;
    border-radius: 10px;
    margin-top: 12px;
  }

  .pay-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .pay-form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pay-form-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .pay-form-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 7px;
    padding: 7px 10px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    width: 100%;
  }
  .pay-form-input:focus {
    border-color: #0d7377;
    box-shadow: 0 0 0 3px rgba(13,115,119,0.1);
  }

  .pay-form-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-color: white;
    padding-right: 28px;
    cursor: pointer;
  }

  .pay-form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .pay-empty {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
    padding: 16px;
    border: 1.5px dashed #e2e8f0;
    border-radius: 10px;
  }
`

// Update the function signature:
  export default function PaymentsSection({ invoiceId, invoiceTotal, orgId, invoice, customer, isSuspended, onPaymentAdded, onPaymentDeleted }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [sendingReceiptId, setSendingReceiptId] = useState(null)
  const [receiptErrors, setReceiptErrors] = useState({})

  const [formAmount, setFormAmount]   = useState('')
  const [formMethod, setFormMethod]   = useState('card')
  const [formNotes, setFormNotes]     = useState('')
  const [formDate, setFormDate]       = useState(new Date().toISOString().split('T')[0])

  const fetchPayments = useCallback(async () => {
    if (!invoiceId || !orgId) return
    const { data } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('org_id', orgId)
      .order('payment_date', { ascending: true })
    setPayments(data || [])
    setLoading(false)
  }, [invoiceId, orgId])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  // Recompute and persist invoice status from a given payments array.
  // Shared by save + delete so status never drifts out of sync with
  // what's actually recorded.
  async function syncInvoiceStatus(currentPayments) {
    const totalPaid = currentPayments.reduce((s, p) => s + Number(p.amount), 0)
    const balance   = Number(invoiceTotal) - totalPaid

    const { error: statusErr } = await supabase
      .from('invoices')
      .update({ status: balance <= 0 ? 'paid' : 'sent' })
      .eq('id', invoiceId)
      .eq('org_id', orgId)

    if (statusErr) throw statusErr
  }

  async function savePayment() {
    const amount = parseFloat(formAmount)
    if (!amount || amount <= 0) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('invoice_payments')
        .insert({
          invoice_id: invoiceId,
          org_id:     orgId,
          amount,
          method:     formMethod,
          note:         formNotes.trim() || null,
          payment_date: formDate,
        })
        .select()
        .single()

      if (error) throw error

      const updatedPayments = [...payments, data]
      setPayments(updatedPayments)

      // ── Sync invoice status based on the new running total ───────────────
      // Payments alone don't move the invoice's status column — without this,
      // the invoice list keeps showing "Sent" even once fully paid, and the
      // only way to fix it is manually editing the invoice's status dropdown.
      await syncInvoiceStatus(updatedPayments)

      onPaymentAdded?.(data)
      setShowForm(false)
      setFormAmount('')
      setFormNotes('')
      setFormMethod('card')
      setFormDate(new Date().toISOString().split('T')[0])
    } catch (err) {
      alert('Failed to save payment: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment(payment) {
    const confirmed = window.confirm(
      `Remove this ${fmt(payment.amount)} payment from this invoice? This can't be undone.`
    )
    if (!confirmed) return

    setDeletingId(payment.id)
    try {
      const { error } = await supabase
        .from('invoice_payments')
        .delete()
        .eq('id', payment.id)
        .eq('org_id', orgId)

      if (error) throw error

      const updatedPayments = payments.filter(p => p.id !== payment.id)
      setPayments(updatedPayments)

      // Re-sync status now that the total paid has changed — a deletion can
      // just as easily flip an invoice from "paid" back to "sent" as an
      // addition can flip it the other way.
      await syncInvoiceStatus(updatedPayments)

      onPaymentDeleted?.(payment.id)
    } catch (err) {
      alert('Failed to remove payment: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSendReceipt(payment) {
    if (!invoice || !customer) {
      setReceiptErrors(prev => ({ ...prev, [payment.id]: 'Missing invoice/customer data' }))
      return
    }
    setSendingReceiptId(payment.id)
    setReceiptErrors(prev => ({ ...prev, [payment.id]: null }))
    try {
      await sendReceipt(payment, invoice, customer, orgId)
      setPayments(prev =>
        prev.map(p => p.id === payment.id ? { ...p, receipt_sent_at: new Date().toISOString() } : p)
      )
    } catch (err) {
      setReceiptErrors(prev => ({ ...prev, [payment.id]: err.message }))
    } finally {
      setSendingReceiptId(null)
    }
  }

  const totalPaid    = payments.reduce((s, p) => s + Number(p.amount), 0)
  const balanceDue   = Number(invoiceTotal) - totalPaid
  const fullySatisfied = balanceDue <= 0

  return (
    <>
      <style>{css}</style>
      <div className="pay-section">
        <div className="pay-section-header">
          <span className="pay-section-title">Payments Received</span>
          {!showForm && (
            <button className="pay-add-btn" onClick={() => setShowForm(true)} disabled={isSuspended}>
              + Record Payment
            </button>
          )}
        </div>

        {/* Payment list */}
        {!loading && payments.length === 0 && !showForm && (
          <div className="pay-empty">No payments recorded yet.</div>
        )}

        {payments.length > 0 && (
          <div className="pay-list">
            {payments.map(p => (
              <div key={p.id} className="pay-item">
                <div className="pay-item-dot" />
                <div className="pay-item-body">
                  <div className="pay-item-top">
                    <span className="pay-item-method">{METHOD_LABELS[p.method] || p.method}</span>
                    <div className="pay-item-amount-group">
                      <span className="pay-item-amount">{fmt(p.amount)}</span>
                      <button
                        className="pay-item-delete"
                        onClick={() => deletePayment(p)}
                        disabled={deletingId === p.id || isSuspended}
                        title="Remove this payment"
                        aria-label="Remove this payment"
                      >
                        {deletingId === p.id ? '…' : '✕'}
                      </button>
                    </div>
                  </div>
                  <div className="pay-item-meta">{fmtDateTime(p.payment_date)}</div>
                  {p.note && <div className="pay-item-notes">"{p.note}"</div>}
                  <div className="pay-item-bottom">
                    <button
                      className="pay-item-receipt-btn"
                      onClick={() => handleSendReceipt(p)}
                      disabled={sendingReceiptId === p.id || isSuspended}
                    >
                      {sendingReceiptId === p.id || isSuspended
                        ? 'Sending…'
                        : p.receipt_sent_at
                          ? 'Resend Receipt'
                          : 'Send Receipt'}
                    </button>
                    {p.receipt_sent_at && !receiptErrors[p.id] && (
                      <span className="pay-item-receipt-sent">
                        Sent {fmtDateTime(p.receipt_sent_at)}
                      </span>
                    )}
                    {receiptErrors[p.id] && (
                      <span className="pay-item-receipt-error">{receiptErrors[p.id]}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Balance summary */}
        {payments.length > 0 && (
          <div className="pay-balance">
            <div className="pay-balance-row">
              <span className="pay-balance-label">Invoice Total</span>
              <span className="pay-balance-value">{fmt(invoiceTotal)}</span>
            </div>
            <div className="pay-balance-row">
              <span className="pay-balance-label">Total Paid</span>
              <span className="pay-balance-value" style={{ color: '#059669' }}>{fmt(totalPaid)}</span>
            </div>
            <div style={{ width: 200, height: 1, background: '#e2e8f0', margin: '2px 0' }} />
            <div className="pay-balance-row pay-balance-row--due">
              <span className="pay-balance-label">Balance Due</span>
              <span className={`pay-balance-value ${fullySatisfied ? 'pay-balance-value--paid' : ''}`}>
                {fullySatisfied ? '✓ Paid in Full' : fmt(balanceDue)}
              </span>
            </div>
          </div>
        )}

        {/* Add payment form */}
        {showForm && (
          <div className="pay-form">
            <div className="pay-form-row">
              <div className="pay-form-field">
                <label className="pay-form-label">Amount *</label>
                <input
                  className="pay-form-input"
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="pay-form-field">
                <label className="pay-form-label">Method</label>
                <select
                  className="pay-form-input pay-form-select"
                  value={formMethod}
                  onChange={e => setFormMethod(e.target.value)}
                >
                  {Object.entries(METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pay-form-field">
              <label className="pay-form-label">Date</label>
              <input
                className="pay-form-input"
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
              />
            </div>
            <div className="pay-form-field">
              <label className="pay-form-label">Notes (optional)</label>
              <input
                className="pay-form-input"
                type="text"
                placeholder="e.g. Cheque #1042, partial payment..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
              />
            </div>
            <div className="pay-form-actions">
              <button
                className="inv-btn inv-btn--ghost"
                onClick={() => { setShowForm(false); setFormAmount(''); setFormNotes('') }}
                disabled={saving || isSuspended}
              >
                Cancel
              </button>
              <button
                className="inv-btn inv-btn--primary"
                onClick={savePayment}
                disabled={saving || !formAmount}
              >
                {saving ? 'Saving…' : '✓ Save Payment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}