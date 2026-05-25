/**
 * components/PayNowButton.jsx
 *
 * Drop-in "Pay Now" button that triggers a HelcimPay.js checkout modal.
 * After a successful payment it:
 *   1. Updates the invoice status to 'paid' in Supabase
 *   2. Records the Helcim transactionId against the invoice
 *   3. Calls the optional onPaid(invoice) callback so parent views can refresh
 *
 * Props:
 *   invoice        — the invoice row object (needs id, total, invoice_number, org_id, status)
 *   customerCode   — optional Helcim customerCode for the org (stored in organization_settings)
 *   onPaid         — optional callback fired after DB update with the updated invoice
 *   className      — optional extra Tailwind classes on the button
 *   compact        — if true, renders a smaller pill-style button
 */

import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useHelcimPay } from '../hooks/useHelcimPay'

export default function PayNowButton({ invoice, customerCode, onPaid, className = '', compact = false }) {
  const [status, setStatus] = useState('idle') // idle | success | error
  const [txnId, setTxnId] = useState(null)

  const handleSuccess = async (txn) => {
    setStatus('success')
    setTxnId(txn?.transactionId ?? null)

    // Mark invoice paid in Supabase
    const { data: updated, error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        helcim_transaction_id: txn?.transactionId ?? null,
        helcim_card_type: txn?.cardType ?? null,
        helcim_card_number: txn?.cardNumber ?? null, // last 4 digits only, safe to store
      })
      .eq('id', invoice.id)
      .select()
      .single()

    if (!error && updated) {
      onPaid?.(updated)
    }
  }

  const handleError = (msg) => {
    setStatus('error')
    setTimeout(() => setStatus('idle'), 4000)
  }

  const { openPayment, loading, error } = useHelcimPay({
    amount: invoice.total,
    invoiceNumber: invoice.invoice_number,
    customerCode,
    onSuccess: handleSuccess,
    onError: handleError,
  })

  // Already paid
  if (invoice.status === 'paid') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm px-4 py-2 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Paid
        {txnId && <span className="font-normal text-emerald-600 text-xs ml-1">#{txnId}</span>}
      </span>
    )
  }

  if (status === 'success') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm px-4 py-2 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Payment received
        {txnId && <span className="font-normal text-emerald-600 text-xs ml-1">#{txnId}</span>}
      </span>
    )
  }

  const base = compact
    ? 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold'
    : 'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold'

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={openPayment}
        disabled={loading}
        className={`${base} bg-teal-700 text-white hover:bg-teal-600 active:scale-95 transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Opening…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Pay now — ${Number(invoice.total).toFixed(2)}
          </>
        )}
      </button>

      {error && status === 'error' && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
