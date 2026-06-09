/**
 * components/PayNowButton.jsx
 *
 * Drop-in "Open payment terminal" button that triggers a HelcimPay.js checkout modal.
 * After a successful payment it:
 *   1. Updates the invoice status to 'paid' in Supabase
 *   2. Records the Helcim transactionId against the invoice
 *   3. Calls the optional onPaid(invoice) callback so parent views can refresh
 *
 * Props:
 *   invoice        — the invoice row object (needs id, total, number, org_id, status)
 *   customerCode   — optional Helcim customerCode for the org (stored in organization_settings)
 *   onPaid         — optional callback fired after DB update with the updated invoice
 */

import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useHelcimPay } from '../hooks/useHelcimPay'

export default function PayNowButton({ invoice, customerCode, onPaid }) {
  const [status, setStatus] = useState('idle') // idle | success | error

  const handleSuccess = async (txn) => {
    setStatus('success')

    const { data: updated, error } = await supabase
      .from('invoices')
      .update({
        status:                'paid',
        paid_at:               new Date().toISOString(),
        helcim_transaction_id: txn?.transactionId   ?? null,
        helcim_card_type:      txn?.cardType        ?? null,
        helcim_card_number:    txn?.cardNumber       ?? null, // last 4 only
      })
      .eq('id', invoice.id)
      .select()
      .single()

    if (!error && updated) {
      onPaid?.(updated)
    }
  }

  const handleError = () => {
    setStatus('error')
    setTimeout(() => setStatus('idle'), 4000)
  }

  const { openPayment, loading, error } = useHelcimPay({
    amount:        invoice.total,
    invoiceNumber: invoice.number,   // ← correct field name (not invoice_number)
    customerCode,
    onSuccess: handleSuccess,
    onError:   handleError,
  })

  // ── Already paid ──────────────────────────────────────────────────────────
  if (invoice.status === 'paid' || status === 'success') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 8,
        background: '#ecfdf5', border: '1.5px solid #6ee7b7',
        color: '#059669', fontSize: 13, fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        ✓ Payment received
      </span>
    )
  }

  // ── Button ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={openPayment}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 20px', borderRadius: 8,
          background: loading ? '#0d737799' : '#0d7377',
          border: '1.5px solid #0d7377',
          color: 'white', fontSize: 13, fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background .15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#14a0a5' }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0d7377' }}
      >
        {loading ? (
          <>
            <span style={{
              width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white', borderRadius: '50%',
              display: 'inline-block', animation: 'spin .7s linear infinite',
            }} />
            Opening…
          </>
        ) : (
          <>💳 Open payment terminal</>
        )}
      </button>

      {status === 'error' && error && (
        <p style={{ fontSize: 12, color: '#e53e3e', margin: 0 }}>{error}</p>
      )}
    </div>
  )
}
