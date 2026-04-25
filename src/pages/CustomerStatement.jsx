// src/pages/CustomerStatement.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { exportStatementPDF } from '../utils/exportStatementPDF'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  .stmt-root {
    --teal:     #0d7377;
    --teal-lt:  #e8f5f5;
    --teal-mid: #14a0a5;
    --slate:    #1e293b;
    --slate-mid:#475569;
    --slate-lt: #94a3b8;
    --border:   #e2e8f0;
    --bg:       #f1f5f9;
    --white:    #ffffff;
    --red:      #e53e3e;
    --green:    #059669;
    --amber:    #d97706;
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 24px 16px 60px;
  }

  /* Top bar */
  .stmt-topbar {
    max-width: 860px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .stmt-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--slate-mid);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 0;
    transition: color .15s;
    font-family: 'DM Sans', sans-serif;
  }
  .stmt-back:hover { color: var(--teal); }
  .stmt-topbar-actions { display: flex; gap: 8px; align-items: center; }

  /* Buttons */
  .stmt-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    border: 1.5px solid var(--border);
    background: var(--white);
    color: var(--slate-mid);
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .stmt-btn:hover { border-color: var(--slate-lt); color: var(--slate); background: #f8fafc; }
  .stmt-btn--primary { background: var(--teal); color: white; border-color: var(--teal); }
  .stmt-btn--primary:hover { background: var(--teal-mid); border-color: var(--teal-mid); color: white; }

  /* Date range bar */
  .stmt-filter {
    max-width: 860px;
    margin: 0 auto 16px;
    background: var(--white);
    border-radius: 10px;
    border: 1px solid var(--border);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .stmt-filter-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--slate-lt);
    white-space: nowrap;
  }
  .stmt-date-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: var(--slate);
    background: #f8fafc;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    padding: 7px 11px;
    outline: none;
    transition: border-color .15s;
  }
  .stmt-date-input:focus { border-color: var(--teal); }
  .stmt-filter-sep { font-size: 12px; color: var(--slate-lt); }

  /* Card */
  .stmt-card {
    background: var(--white);
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
    max-width: 860px;
    margin: 0 auto;
    overflow: hidden;
  }

  /* Header band */
  .stmt-header {
    background: linear-gradient(135deg, var(--slate) 0%, #2d3f55 100%);
    padding: 36px 44px 32px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .stmt-brand-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: white;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .stmt-brand-tag {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 5px;
  }
  .stmt-header-right { text-align: right; }
  .stmt-header-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 22px;
    font-weight: 300;
    color: white;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .stmt-header-period {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    margin-top: 6px;
    letter-spacing: 0.04em;
  }

  /* Body */
  .stmt-body { padding: 36px 44px; }

  /* Customer info + summary row */
  .stmt-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    padding-bottom: 28px;
    border-bottom: 1.5px solid var(--border);
    margin-bottom: 28px;
  }
  .stmt-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--teal);
    margin-bottom: 10px;
  }
  .stmt-customer-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 600;
    color: var(--slate);
    margin-bottom: 4px;
  }
  .stmt-customer-detail {
    font-size: 13px;
    color: var(--slate-mid);
    line-height: 1.7;
  }

  /* Summary boxes */
  .stmt-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .stmt-sum-box {
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .stmt-sum-box-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--slate-lt);
    margin-bottom: 5px;
  }
  .stmt-sum-box-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 18px;
    font-weight: 600;
    color: var(--slate);
  }
  .stmt-sum-box--outstanding .stmt-sum-box-value { color: var(--amber); }
  .stmt-sum-box--overdue .stmt-sum-box-value { color: var(--red); }

  /* Table */
  .stmt-table-wrap { overflow-x: auto; }
  .stmt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .stmt-table thead tr { border-bottom: 1.5px solid var(--border); }
  .stmt-table th {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--slate-lt);
    padding: 0 12px 12px;
    text-align: left;
    white-space: nowrap;
  }
  .stmt-table th:not(:first-child) { text-align: right; }
  .stmt-table th:nth-child(2),
  .stmt-table th:nth-child(3) { text-align: left; }

  .stmt-table td {
    padding: 13px 12px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    color: var(--slate-mid);
  }
  .stmt-table tbody tr:last-child td { border-bottom: none; }
  .stmt-table tbody tr:hover { background: #f8fafc; }

  .stmt-td-num { font-size: 13px; font-weight: 500; color: var(--slate); }
  .stmt-td-date { white-space: nowrap; }
  .stmt-td-amount {
    text-align: right;
    font-weight: 600;
    color: var(--slate);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .stmt-td-balance {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Status badge */
  .stmt-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .stmt-badge--draft  { background: #f1f5f9; color: #94a3b8; }
  .stmt-badge--sent   { background: #eff6ff; color: #2563eb; }
  .stmt-badge--paid   { background: #f0fdf4; color: #059669; }
  .stmt-badge--void   { background: #fff5f5; color: #e53e3e; }
  .stmt-badge--overdue { background: #fff5f5; color: var(--red); }

  /* Totals */
  .stmt-totals {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1.5px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
  }
  .stmt-total-row {
    display: flex;
    gap: 48px;
    align-items: baseline;
  }
  .stmt-total-label {
    font-size: 12px;
    color: var(--slate-lt);
    min-width: 120px;
    text-align: right;
  }
  .stmt-total-value {
    font-size: 14px;
    color: var(--slate-mid);
    min-width: 110px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .stmt-total-divider { width: 280px; height: 1px; background: var(--border); margin: 4px 0; }
  .stmt-total-row--grand .stmt-total-label { font-size: 13px; font-weight: 600; color: var(--slate); }
  .stmt-total-row--grand .stmt-total-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 24px;
    font-weight: 600;
    color: var(--teal);
  }

  /* Footer */
  .stmt-footer {
    margin-top: 36px;
    padding-top: 20px;
    border-top: 1px dashed var(--border);
    font-size: 12px;
    color: var(--slate-lt);
    text-align: center;
    letter-spacing: 0.03em;
  }

  /* Empty */
  .stmt-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--slate-lt);
    font-size: 13px;
    border: 1.5px dashed var(--border);
    border-radius: 10px;
  }

  /* Loading */
  .stmt-spinner {
    width: 32px; height: 32px;
    border: 2.5px solid var(--border);
    border-top-color: var(--teal);
    border-radius: 50%;
    animation: stmtspin .7s linear infinite;
    margin: 80px auto;
  }
  @keyframes stmtspin { to { transform: rotate(360deg); } }

  /* Responsive */
  @media (max-width: 600px) {
    .stmt-header { padding: 24px 20px; }
    .stmt-body   { padding: 24px 20px; }
    .stmt-meta   { grid-template-columns: 1fr; }
    .stmt-summary { grid-template-columns: 1fr 1fr; }
  }
    
`
const fmt     = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

function firstOfMonth(offsetMonths = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths, 1)
  return d.toISOString().split('T')[0]
}
function lastOfMonth(offsetMonths = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths + 1, 0)
  return d.toISOString().split('T')[0]
}

export default function CustomerStatement() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [customer, setCustomer]   = useState(null)
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [bizName, setBizName]     = useState('Klair Computer Inc.')
  const [dateFrom, setDateFrom]   = useState(firstOfMonth(-2))
  const [dateTo, setDateTo]       = useState(lastOfMonth(0))

  useEffect(() => { fetchData() }, [id, dateFrom, dateTo])

  async function fetchData() {
    setLoading(true)
    try {
      const [custRes, invRes, settingsRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).single(),
        supabase.from('invoices')
          .select('*')
          .eq('customer_id', id)
          .gte('date', dateFrom)
          .lte('date', dateTo)
          .neq('status', 'void')
          .order('date', { ascending: true }),
        supabase.from('settings').select('key, value')
      ])
      const { data: settingsData } = await supabase.from('settings').select('key, value')
      const settings = (settingsData || []).reduce((acc, item) => {
        acc[item.key] = item.value
        return acc
      }, {})
      const bizName = settings.company_name || 'Klair Computer Inc.'
      if (custRes.data)    setCustomer(custRes.data)
      if (invRes.data)     setInvoices(invRes.data)
      if (settingsRes.data?.find(s => s.key === 'business_name')) {
        setBizName(settingsRes.data.find(s => s.key === 'business_name').value)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function getBadge(inv) {
    if (inv.status === 'paid') return 'paid'
    if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < today) return 'overdue'
    return inv.status
  }

  // Running balance
  let runningBalance = 0
  const rows = invoices.map(inv => {
    const amount = Number(inv.total || 0)
    if (inv.status !== 'paid') runningBalance += amount
    return { ...inv, _amount: amount, _balance: inv.status === 'paid' ? null : runningBalance }
  })

  const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalPaid       = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid
  const totalOverdue    = invoices
    .filter(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < today)
    .reduce((s, i) => s + Number(i.total || 0), 0)

  const periodLabel = `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
  
  const [exporting, setExporting] = useState(false)
 async function handleExport() {
  setExporting(true)
  try {
    await exportStatementPDF(customer, invoices, dateFrom, dateTo)
  } catch (err) {
    alert('Export failed: ' + err.message)
  } finally {
    setExporting(false)
  }
}

  if (loading) return (
    <>
      alert('Tip: In the print dialog, set "Headers and footers" to Off for a clean PDF.')
      window.print()
      <style>{css}</style>
      <div className="stmt-root"><div className="stmt-spinner" /></div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div className="stmt-root">

        {/* Top bar */}
        <div className="stmt-topbar">
          <button className="stmt-back" onClick={() => navigate(-1)}>← Back</button>
          <div className="stmt-topbar-actions">
            <button className="stmt-btn stmt-btn--primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Generating...' : '↓ Export PDF'}
            </button>
          </div>
        </div>

        {/* Date range filter */}
        <div className="stmt-filter">
          <span className="stmt-filter-label">Statement Period</span>
          <input
            type="date"
            className="stmt-date-input"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span className="stmt-filter-sep">to</span>
          <input
            type="date"
            className="stmt-date-input"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>

        {/* Statement card */}
        <div className="stmt-card">

          {/* Header */}
          <div className="stmt-header">
            <div>
              <div className="stmt-brand-name">{bizName}</div>
              <div className="stmt-brand-tag">Account Statement</div>
            </div>
            <div className="stmt-header-right">
              <div className="stmt-header-title">Statement</div>
              <div className="stmt-header-period">Period: {periodLabel}</div>
              <div className="stmt-header-period">
                Prepared: {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="stmt-body">

            {/* Customer + summary */}
            <div className="stmt-meta">
              <div>
                <div className="stmt-section-label">Billed To</div>
                <div className="stmt-customer-name">{customer?.name || '—'}</div>
                <div className="stmt-customer-detail">
                  {customer?.email   && <div>{customer.email}</div>}
                  {customer?.phone   && <div>{customer.phone}</div>}
                  {customer?.address && <div>{customer.address}</div>}
                </div>
              </div>

              <div>
                <div className="stmt-section-label">Account Summary</div>
                <div className="stmt-summary">
                  <div className="stmt-sum-box">
                    <div className="stmt-sum-box-label">Invoiced</div>
                    <div className="stmt-sum-box-value">{fmt(totalInvoiced)}</div>
                  </div>
                  <div className="stmt-sum-box stmt-sum-box--outstanding">
                    <div className="stmt-sum-box-label">Outstanding</div>
                    <div className="stmt-sum-box-value">{fmt(totalOutstanding)}</div>
                  </div>
                  <div className="stmt-sum-box stmt-sum-box--overdue">
                    <div className="stmt-sum-box-label">Overdue</div>
                    <div className="stmt-sum-box-value">{fmt(totalOverdue)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice table */}
            {invoices.length === 0 ? (
              <div className="stmt-empty">
                No invoices found for this period.
              </div>
            ) : (
              <div className="stmt-table-wrap">
                <table className="stmt-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Due Date</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(inv => (
                      <tr
                        key={inv.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        <td className="stmt-td-num">{inv.number}</td>
                        <td className="stmt-td-date">{fmtDate(inv.date)}</td>
                        <td className="stmt-td-date">{inv.due_date ? fmtDate(inv.due_date) : 'Net 30'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`stmt-badge stmt-badge--${getBadge(inv)}`}>
                            {getBadge(inv)}
                          </span>
                        </td>
                        <td className="stmt-td-amount">{fmt(inv._amount)}</td>
                        <td className={`stmt-td-balance`} style={{
                          color: inv.status === 'paid' ? '#059669' : inv._balance > 0 ? '#d97706' : 'var(--slate)'
                        }}>
                          {inv.status === 'paid' ? '—' : fmt(inv._balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            {invoices.length > 0 && (
              <div className="stmt-totals">
                <div className="stmt-total-row">
                  <span className="stmt-total-label">Total Invoiced</span>
                  <span className="stmt-total-value">{fmt(totalInvoiced)}</span>
                </div>
                <div className="stmt-total-row">
                  <span className="stmt-total-label">Total Paid</span>
                  <span className="stmt-total-value" style={{ color: '#059669' }}>({fmt(totalPaid)})</span>
                </div>
                <div className="stmt-total-divider" />
                <div className="stmt-total-row stmt-total-row--grand">
                  <span className="stmt-total-label">Balance Owing</span>
                  <span className="stmt-total-value">{fmt(totalOutstanding)}</span>
                </div>
              </div>
            )}

            <div className="stmt-footer">
              Please reference your invoice number when making payment. Thank you for your business.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}