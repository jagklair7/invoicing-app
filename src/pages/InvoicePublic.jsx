// src/pages/InvoicePublic.jsx
//
// Public, unauthenticated invoice view for customers — reached via the link
// included in the sent invoice email (route: /i/:token, added as a sibling
// to /q/:token in App.jsx, outside the Layout shell, same as QuotePublic).
//
// ASSUMPTIONS FLAGGED:
//   - I don't have QuotePublic.jsx to copy its exact structure/styling, so
//     this reuses the visual language of InvoiceView.jsx's read-only mode
//     (fonts, color tokens, table layout) rather than matching Quotes'
//     public page pixel-for-pixel. If you want them to look identical,
//     share QuotePublic.jsx and I'll re-align this to it.
//   - The actual card-charging call (initiateHelcimCheckout) posts to a new
//     'public-invoice-pay' Edge Function that I've sketched separately and
//     flagged heavily — I do NOT have your Helcim API token handling,
//     PayNowButton.jsx, or any existing charge Edge Function to mirror, so
//     don't deploy that piece as-is without reviewing it against how
//     Helcim is actually wired up elsewhere in this app.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --teal: #0d7377;
    --teal-lt: #e8f5f5;
    --slate: #1e293b;
    --slate-mid: #475569;
    --slate-lt: #94a3b8;
    --border: #e2e8f0;
    --bg: #f1f5f9;
    --white: #ffffff;
    --radius: 12px;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
  }

  .pub-root {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 40px 16px 60px;
  }

  .pub-card {
    background: var(--white);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    max-width: 640px;
    margin: 0 auto;
    overflow: hidden;
  }

  .pub-header {
    background: linear-gradient(135deg, var(--slate) 0%, #2d3f55 100%);
    padding: 32px 40px;
    color: white;
  }

  .pub-company {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 600;
  }

  .pub-invoice-number {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px;
    font-weight: 300;
    margin-top: 6px;
  }

  .pub-body {
    padding: 32px 40px;
  }

  .pub-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--slate-mid);
    padding: 6px 0;
  }

  .pub-table {
    width: 100%;
    margin-top: 20px;
    border-collapse: collapse;
  }
  .pub-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--slate-lt);
    text-align: left;
    padding: 8px 4px;
    border-bottom: 1.5px solid var(--border);
  }
  .pub-table th:not(:first-child) { text-align: right; }
  .pub-table td {
    padding: 10px 4px;
    font-size: 13px;
    color: var(--slate);
    border-bottom: 1px solid #f1f5f9;
  }
  .pub-table td:not(:first-child) { text-align: right; }

  .pub-totals {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1.5px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .pub-total-grand {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 24px;
    font-weight: 600;
    color: var(--teal);
  }

  .pub-pay-btn {
    margin-top: 28px;
    width: 100%;
    padding: 14px;
    border-radius: 10px;
    background: var(--teal);
    color: white;
    font-weight: 600;
    font-size: 15px;
    border: none;
    cursor: pointer;
  }
  .pub-pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .pub-paid-banner {
    margin-top: 28px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
    padding: 14px 16px;
    border-radius: 10px;
    text-align: center;
    font-weight: 600;
    font-size: 14px;
  }

  .pub-error {
    margin-top: 28px;
    background: #fff5f5;
    border: 1px solid #fecaca;
    color: #e53e3e;
    padding: 14px 16px;
    border-radius: 10px;
    font-size: 13px;
  }

  .pub-loading {
    display: flex;
    justify-content: center;
    padding: 80px 0;
    color: var(--slate-lt);
    font-size: 13px;
  }
`

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

export default function InvoicePublic() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)

  useEffect(() => {
    loadInvoice()
  }, [token])

  async function loadInvoice() {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('get_invoice_by_token', {
        p_token: token,
      })
      if (rpcErr) throw rpcErr
      if (!result) throw new Error('Invoice not found')
      setData(result)
    } catch (err) {
      setError('This invoice link is invalid or has expired.')
    } finally {
      setLoading(false)
    }
  }

  // Flagged: this calls a new 'public-invoice-pay' Edge Function I've
  // sketched separately, NOT an existing one — see that file's header for
  // what's unverified before wiring this up for real.
  async function handlePayNow() {
    setPaying(true)
    setPayError(null)
    try {
      const { data: session, error: fnErr } = await supabase.functions.invoke('public-invoice-pay', {
        body: { token },
      })
      if (fnErr) throw fnErr
      if (!session?.checkoutToken) throw new Error('Could not start checkout')

      // Helcim's HelcimPay.js is expected to be loaded globally (script tag
      // in index.html) — verify this against however Helcim is already
      // loaded for the staff-side Charge Card flow.
      if (typeof window.appendHelcimPayIframe !== 'function') {
        throw new Error('Payment system unavailable — please contact us directly.')
      }
      window.appendHelcimPayIframe(session.checkoutToken)

      window.addEventListener('message', async (event) => {
        if (event.data?.eventName !== `helcim-pay-js-${session.checkoutToken}`) return
        if (event.data?.eventStatus === 'SUCCESS') {
          await loadInvoice() // re-fetch to pick up server-confirmed paid status
        } else {
          setPayError('Payment was not completed.')
        }
      })
    } catch (err) {
      setPayError(err.message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="pub-root">
          <div className="pub-loading">Loading invoice…</div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <style>{css}</style>
        <div className="pub-root">
          <div className="pub-card" style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#e53e3e' }}>{error}</p>
          </div>
        </div>
      </>
    )
  }

  const { invoice, customer, org, items } = data
  const canPay = invoice.online_payment_enabled && invoice.status !== 'paid' && invoice.status !== 'void'

  return (
    <>
      <style>{css}</style>
      <div className="pub-root">
        <div className="pub-card">
          <div className="pub-header">
            <div className="pub-company">{org?.company_name || 'Invoice'}</div>
            <div className="pub-invoice-number">Invoice {invoice.number}</div>
          </div>
          <div className="pub-body">
            <div className="pub-row">
              <span>Billed to</span>
              <span>{customer?.name}</span>
            </div>
            <div className="pub-row">
              <span>Issued</span>
              <span>{fmtDate(invoice.date)}</span>
            </div>
            <div className="pub-row">
              <span>Due</span>
              <span>{fmtDate(invoice.due_date)}</span>
            </div>
            <div className="pub-row">
              <span>Status</span>
              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{invoice.status}</span>
            </div>

            <table className="pub-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{fmt(item.unit_price)}</td>
                    <td>{fmt((item.quantity || 0) * (item.unit_price || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pub-totals">
              <div className="pub-row" style={{ width: 220 }}>
                <span>Subtotal</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>
              <div className="pub-row" style={{ width: 220 }}>
                <span>Tax</span>
                <span>{fmt(invoice.tax)}</span>
              </div>
              <div className="pub-row pub-total-grand" style={{ width: 220 }}>
                <span>Total Due</span>
                <span>{fmt(invoice.total)}</span>
              </div>
            </div>

            {invoice.status === 'paid' && <div className="pub-paid-banner">✓ This invoice has been paid</div>}

            {canPay && (
              <>
                <button className="pub-pay-btn" onClick={handlePayNow} disabled={paying}>
                  {paying ? 'Starting checkout…' : `Pay Now — ${fmt(invoice.total)}`}
                </button>
                {payError && <div className="pub-error">{payError}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
