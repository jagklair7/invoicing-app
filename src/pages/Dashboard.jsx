// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  .dash {
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
    --amber:    #d97706;
    --green:    #059669;
    --blue:     #2563eb;
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 28px 24px 60px;
  }

  /* ── Header ── */
  .dash-header {
    max-width: 1100px;
    margin: 0 auto 28px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .dash-greeting {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    color: var(--slate);
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .dash-greeting span { color: var(--teal); }
  .dash-date {
    font-size: 12px;
    color: var(--slate-lt);
    margin-top: 4px;
    letter-spacing: 0.04em;
  }
  .dash-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ── Buttons ── */
  .dash-btn {
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
  .dash-btn:hover { border-color: var(--slate-lt); color: var(--slate); background: #f8fafc; }
  .dash-btn--primary {
    background: var(--teal); color: white; border-color: var(--teal);
  }
  .dash-btn--primary:hover { background: var(--teal-mid); border-color: var(--teal-mid); color: white; }

  /* ── Grid ── */
  .dash-grid {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }
  @media (max-width: 900px) { .dash-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 500px) { .dash-grid { grid-template-columns: 1fr; } }

  /* ── Stat card ── */
  .dash-stat {
    background: var(--white);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--border);
    transition: box-shadow .2s;
  }
  .dash-stat:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

  .dash-stat-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dash-stat-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--slate-lt);
  }
  .dash-stat-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px;
  }
  .dash-stat-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: var(--slate);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .dash-stat-sub {
    font-size: 12px;
    color: var(--slate-lt);
  }
  .dash-stat-sub b { color: var(--slate-mid); font-weight: 500; }

  /* ── Two-col layout ── */
  .dash-row {
    max-width: 1100px;
    margin: 0 auto 20px;
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 16px;
  }
  @media (max-width: 800px) { .dash-row { grid-template-columns: 1fr; } }

  /* ── Panel ── */
  .dash-panel {
    background: var(--white);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .dash-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .dash-panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--slate);
    letter-spacing: -0.01em;
  }
  .dash-panel-link {
    font-size: 12px;
    color: var(--teal);
    cursor: pointer;
    background: none;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-weight: 500;
    padding: 0;
  }
  .dash-panel-link:hover { text-decoration: underline; }

  /* ── Chart ── */
  .dash-chart {
    padding: 20px;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 160px;
  }
  .dash-chart-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    height: 100%;
    justify-content: flex-end;
  }
  .dash-chart-bar-wrap {
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    flex: 1;
  }
  .dash-chart-bar {
    width: 100%;
    max-width: 36px;
    border-radius: 5px 5px 0 0;
    background: linear-gradient(180deg, var(--teal-mid) 0%, var(--teal) 100%);
    transition: opacity .15s;
    min-height: 4px;
  }
  .dash-chart-bar:hover { opacity: 0.75; }
  .dash-chart-bar--empty { background: var(--border); }
  .dash-chart-label {
    font-size: 10px;
    color: var(--slate-lt);
    white-space: nowrap;
    letter-spacing: 0.03em;
  }
  .dash-chart-value {
    font-size: 10px;
    color: var(--slate-mid);
    font-weight: 500;
  }

  /* ── Invoice list ── */
  .dash-inv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid #f8fafc;
    cursor: pointer;
    transition: background .1s;
    gap: 12px;
  }
  .dash-inv-row:last-child { border-bottom: none; }
  .dash-inv-row:hover { background: #f8fafc; }
  .dash-inv-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .dash-inv-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--slate);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dash-inv-num { font-size: 11px; color: var(--slate-lt); }
  .dash-inv-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .dash-inv-amount { font-size: 13px; font-weight: 600; color: var(--slate); font-variant-numeric: tabular-nums; }

  /* ── Status badge ── */
  .dash-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .dash-badge--draft  { background: #f1f5f9; color: #94a3b8; }
  .dash-badge--sent   { background: #eff6ff; color: #2563eb; }
  .dash-badge--paid   { background: #f0fdf4; color: #059669; }
  .dash-badge--void   { background: #fff5f5; color: #e53e3e; }

  /* ── Overdue ── */
  .dash-overdue-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 20px;
    border-bottom: 1px solid #f8fafc;
    cursor: pointer;
    transition: background .1s;
    gap: 12px;
  }
  .dash-overdue-row:last-child { border-bottom: none; }
  .dash-overdue-row:hover { background: #fff8f8; }
  .dash-overdue-name { font-size: 13px; font-weight: 500; color: var(--slate); }
  .dash-overdue-days { font-size: 11px; color: var(--red); font-weight: 500; }
  .dash-overdue-amount { font-size: 13px; font-weight: 600; color: var(--red); font-variant-numeric: tabular-nums; }

  .dash-empty {
    padding: 32px 20px;
    text-align: center;
    font-size: 13px;
    color: var(--slate-lt);
  }

  /* ── Loading ── */
  .dash-spinner {
    width: 28px; height: 28px;
    border: 2.5px solid var(--border);
    border-top-color: var(--teal);
    border-radius: 50%;
    animation: dspin .7s linear infinite;
    margin: 60px auto;
  }
  @keyframes dspin { to { transform: rotate(360deg); } }
`

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function greetingTime() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { activeOrg, settings } = useOrg()   // ← add this

  const [loading, setLoading]       = useState(true)
  const [stats, setStats]           = useState({ total: 0, paid: 0, outstanding: 0, customers: 0, draft: 0, sent: 0 })
  const [recent, setRecent]         = useState([])
  const [overdue, setOverdue]       = useState([])
  const [chartData, setChartData]   = useState([])
  const [bizName, setBizName]       = useState('Klair Computer Inc.')

 // useEffect(() => { fetchAll() }, [])

  // ← re-fetch whenever active org changes
  useEffect(() => {
    if (activeOrg?.orgId) fetchAll()
  }, [activeOrg?.orgId])

  async function fetchAll() {
    setLoading(true)
    try {
      const [invRes, custRes, settingsRes] = await Promise.all([
        supabase.from('invoices').select('*, customers(name)')
        .eq('org_id', activeOrg.orgId)          // ← scoped
        .order('created_at', { ascending: false }),
        supabase.from('customers').select('id')
        .eq('org_id', activeOrg.orgId),          // ← scoped
      
       // supabase.from('settings').select('key, value')
       supabase
          .from('organization_settings')           // ← correct table
          .select('company_name')
          .eq('org_id', activeOrg.orgId)
          .single()
      ])

      const invoices   = invRes.data   || []
      const customers  = custRes.data  || []

    //  if (settingsRes.data?.business_name) setBizName(settingsRes.data.business_name)
    // Use org settings for biz name, fall back to org name
      setBizName(settingsRes.data?.company_name || activeOrg.name || '')

      // ── Stats ──
      const paid        = invoices.filter(i => i.status === 'paid')
      const sent        = invoices.filter(i => i.status === 'sent')
      const draft       = invoices.filter(i => i.status === 'draft')
      const paidTotal   = paid.reduce((s, i) => s + Number(i.total || 0), 0)
      const outTotal    = sent.reduce((s, i) => s + Number(i.total || 0), 0)

      setStats({
        total:       invoices.length,
        paid:        paidTotal,
        outstanding: outTotal,
        customers:   customers.length,
        draft:       draft.length,
        sent:        sent.length,
      })

      // ── Recent invoices (last 6) ──
      setRecent(invoices.slice(0, 6))

      // ── Overdue: sent invoices past due_date ──
      const today = new Date()
      today.setHours(0,0,0,0)
      const od = invoices
        .filter(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < today)
        .map(i => ({
          ...i,
          daysOverdue: Math.floor((today - new Date(i.due_date)) / 86400000)
        }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
      setOverdue(od)

      // ── Chart: revenue by month (last 6 months) ──
      const now = new Date()
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
        return { month: d.getMonth(), year: d.getFullYear(), label: MONTHS[d.getMonth()], total: 0 }
      })
      invoices
        .filter(i => i.status === 'paid' && i.date)
        .forEach(i => {
          const d = new Date(i.date)
          const slot = months.find(m => m.month === d.getMonth() && m.year === d.getFullYear())
          if (slot) slot.total += Number(i.total || 0)
        })
      setChartData(months)

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const chartMax = Math.max(...chartData.map(m => m.total), 1)

  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="dash"><div className="dash-spinner" /></div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div className="dash">

        {/* ── Header ── */}
        <div className="dash-header">
          <div>
            <div className="dash-greeting">{greetingTime()}, <span>{bizName}</span></div>
            <div className="dash-date">{today}</div>
          </div>
          <div className="dash-quick-actions">
            <button className="dash-btn" onClick={() => navigate('/customers')}>+ New Customer</button>
            <button className="dash-btn dash-btn--primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="dash-grid">
          <div className="dash-stat">
            <div className="dash-stat-top">
              <span className="dash-stat-label">Revenue Collected</span>
              <div className="dash-stat-icon" style={{ background: '#f0fdf4' }}>💰</div>
            </div>
            <div className="dash-stat-value">{fmt(stats.paid)}</div>
            <div className="dash-stat-sub">From <b>{stats.total}</b> total invoices</div>
          </div>

          <div className="dash-stat">
            <div className="dash-stat-top">
              <span className="dash-stat-label">Outstanding</span>
              <div className="dash-stat-icon" style={{ background: '#fffbeb' }}>⏳</div>
            </div>
            <div className="dash-stat-value" style={{ color: stats.outstanding > 0 ? '#d97706' : 'var(--slate)' }}>
              {fmt(stats.outstanding)}
            </div>
            <div className="dash-stat-sub"><b>{stats.sent}</b> sent invoice{stats.sent !== 1 ? 's' : ''} awaiting payment</div>
          </div>

          <div className="dash-stat">
            <div className="dash-stat-top">
              <span className="dash-stat-label">Overdue</span>
              <div className="dash-stat-icon" style={{ background: '#fff5f5' }}>🔴</div>
            </div>
            <div className="dash-stat-value" style={{ color: overdue.length > 0 ? '#e53e3e' : 'var(--slate)' }}>
              {overdue.length}
            </div>
            <div className="dash-stat-sub">
              {overdue.length > 0
                ? <b style={{ color: '#e53e3e' }}>{fmt(overdue.reduce((s,i) => s + Number(i.total||0), 0))} at risk</b>
                : 'All invoices on track'}
            </div>
          </div>

          <div className="dash-stat">
            <div className="dash-stat-top">
              <span className="dash-stat-label">Customers</span>
              <div className="dash-stat-icon" style={{ background: 'var(--teal-lt)' }}>🏢</div>
            </div>
            <div className="dash-stat-value">{stats.customers}</div>
            <div className="dash-stat-sub"><b>{stats.draft}</b> draft invoice{stats.draft !== 1 ? 's' : ''} in progress</div>
          </div>
        </div>

        {/* ── Chart + Overdue ── */}
        <div className="dash-row">

          {/* Revenue chart */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Revenue — Last 6 Months (Paid)</span>
            </div>
            <div className="dash-chart">
              {chartData.map((m, i) => (
                <div className="dash-chart-col" key={i}>
                  <div className="dash-chart-value">{m.total > 0 ? fmt(m.total).replace('CA$','$') : ''}</div>
                  <div className="dash-chart-bar-wrap">
                    <div
                      className={`dash-chart-bar ${m.total === 0 ? 'dash-chart-bar--empty' : ''}`}
                      style={{ height: `${Math.max((m.total / chartMax) * 100, m.total > 0 ? 8 : 4)}%` }}
                      title={`${m.label}: ${fmt(m.total)}`}
                    />
                  </div>
                  <div className="dash-chart-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Overdue */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">⚠️ Overdue Invoices</span>
              <button className="dash-panel-link" onClick={() => navigate('/invoices')}>View all</button>
            </div>
            {overdue.length === 0 ? (
              <div className="dash-empty">🎉 No overdue invoices</div>
            ) : overdue.slice(0, 5).map(inv => (
              <div key={inv.id} className="dash-overdue-row" onClick={() => navigate(`/invoices/${inv.id}`)}>
                <div>
                  <div className="dash-overdue-name">{inv.customers?.name || '—'}</div>
                  <div className="dash-overdue-days">{inv.daysOverdue}d overdue · {inv.number}</div>
                </div>
                <div className="dash-overdue-amount">{fmt(inv.total)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent invoices ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Recent Invoices</span>
              <button className="dash-panel-link" onClick={() => navigate('/invoices')}>View all →</button>
            </div>
            {recent.length === 0 ? (
              <div className="dash-empty">No invoices yet. <span style={{ color: 'var(--teal)', cursor: 'pointer' }} onClick={() => navigate('/invoices/new')}>Create your first →</span></div>
            ) : recent.map(inv => (
              <div key={inv.id} className="dash-inv-row" onClick={() => navigate(`/invoices/${inv.id}`)}>
                <div className="dash-inv-left">
                  <div className="dash-inv-name">{inv.customers?.name || '—'}</div>
                  <div className="dash-inv-num">{inv.number} · {inv.date ? new Date(inv.date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                </div>
                <div className="dash-inv-right">
                  <div className="dash-inv-amount">{fmt(inv.total)}</div>
                  <span className={`dash-badge dash-badge--${inv.status}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}