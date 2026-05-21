// src/pages/admin/GlobalAnalytics.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../app/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../context/OrgContext'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600&family=DM+Sans:wght@300;400;500;600&display=swap');

  .ga {
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
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 28px 24px 60px;
  }

  .ga-header {
    max-width: 1200px;
    margin: 0 auto 28px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .ga-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    color: var(--slate);
    letter-spacing: -0.02em;
  }
  .ga-subtitle { font-size: 13px; color: var(--slate-lt); margin-top: 3px; }

  .ga-back {
    font-size: 13px; color: var(--teal); background: none; border: none;
    cursor: pointer; font-family: 'DM Sans', sans-serif; font-weight: 500;
  }
  .ga-back:hover { text-decoration: underline; }

  /* ── Stat grid ── */
  .ga-grid {
    max-width: 1200px;
    margin: 0 auto 20px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  @media (max-width: 960px) { .ga-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 520px)  { .ga-grid { grid-template-columns: 1fr; } }

  .ga-stat {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px 22px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .ga-stat-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--slate-lt); margin-bottom: 10px;
  }
  .ga-stat-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px; font-weight: 600; color: var(--slate);
    letter-spacing: -0.02em; line-height: 1;
  }
  .ga-stat-note { font-size: 12px; color: var(--slate-lt); margin-top: 6px; }
  .ga-stat-note b { color: var(--slate-mid); font-weight: 500; }

  /* ── MRR banner ── */
  .ga-mrr {
    max-width: 1200px;
    margin: 0 auto 20px;
    background: linear-gradient(135deg, #1e293b 0%, #2d3f55 100%);
    border-radius: 14px;
    padding: 22px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 20px;
  }
  .ga-mrr-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 6px; }
  .ga-mrr-value { font-family: 'Fraunces', Georgia, serif; font-size: 32px; font-weight: 600; color: white; letter-spacing: -0.02em; }
  .ga-mrr-note { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
  .ga-mrr-pill {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px; padding: 12px 18px; text-align: center;
  }
  .ga-mrr-pill-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 4px; }
  .ga-mrr-pill-value { font-size: 18px; font-weight: 700; color: white; }

  /* ── Panel ── */
  .ga-panel {
    max-width: 1200px;
    margin: 0 auto 20px;
    background: var(--white);
    border-radius: 14px;
    border: 1px solid var(--border);
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .ga-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 22px; border-bottom: 1px solid var(--border);
  }
  .ga-panel-title {
    font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--slate-mid);
  }

  /* ── Chart ── */
  .ga-chart {
    padding: 20px 22px;
    display: flex;
    align-items: flex-end;
    gap: 10px;
    height: 160px;
  }
  .ga-chart-col {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; gap: 6px; height: 100%; justify-content: flex-end;
  }
  .ga-chart-bar-wrap {
    width: 100%; display: flex; align-items: flex-end;
    justify-content: center; flex: 1;
  }
  .ga-chart-bar {
    width: 100%; max-width: 40px; border-radius: 5px 5px 0 0;
    background: linear-gradient(180deg, var(--teal-mid) 0%, var(--teal) 100%);
    min-height: 4px; transition: opacity .15s;
  }
  .ga-chart-bar:hover { opacity: 0.75; }
  .ga-chart-bar--empty { background: var(--border); }
  .ga-chart-label { font-size: 10px; color: var(--slate-lt); }
  .ga-chart-value { font-size: 10px; color: var(--slate-mid); font-weight: 500; }

  /* ── Table ── */
  .ga-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ga-table th {
    padding: 10px 18px; font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--slate-lt);
    background: #f8fafc; border-bottom: 1px solid var(--border); text-align: left;
  }
  .ga-table td {
    padding: 12px 18px; border-bottom: 1px solid #f8fafc;
    color: var(--slate-mid); vertical-align: middle;
  }
  .ga-table tr:last-child td { border-bottom: none; }
  .ga-table tbody tr:hover { background: #f8fafc; }
  .ga-table td:first-child { color: var(--slate); font-weight: 500; }

  /* ── Plan badge ── */
  .ga-plan {
    display: inline-flex; align-items: center;
    padding: 2px 9px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .ga-plan--free       { background: #f1f5f9; color: #94a3b8; }
  .ga-plan--starter    { background: #eff6ff; color: #2563eb; }
  .ga-plan--pro        { background: #f0fdf4; color: #059669; }
  .ga-plan--enterprise { background: #fefce8; color: #a16207; }

  /* ── Two col ── */
  .ga-two {
    max-width: 1200px;
    margin: 0 auto 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  @media (max-width: 800px) { .ga-two { grid-template-columns: 1fr; } }

  /* ── Helcim notice ── */
  .ga-helcim {
    max-width: 1200px;
    margin: 0 auto 20px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 12px;
    padding: 14px 20px;
    font-size: 13px;
    color: var(--amber);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* ── Spinner ── */
  .ga-spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--teal);
    border-radius: 50%;
    animation: gaspin .7s linear infinite;
    margin: 80px auto;
  }
  @keyframes gaspin { to { transform: rotate(360deg); } }

  .ga-empty { padding: 28px 22px; font-size: 13px; color: var(--slate-lt); }
`

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// 2025 plan pricing (monthly)
const PLAN_PRICES = { free: 0, starter: 29, pro: 79, enterprise: 199 }

export default function GlobalAnalytics() {
  const navigate = useNavigate()
  const { loading: orgLoading } = useOrg()
  const [loading, setLoading] = useState(true)

  const [stats, setStats]               = useState({})
  const [planBreakdown, setPlanBreakdown] = useState([])
  const [chartData, setChartData]       = useState([])
  const [signupChart, setSignupChart]   = useState([])
  const [recentOrgs, setRecentOrgs]     = useState([])
  const [topOrgs, setTopOrgs]           = useState([])
  const [userRows, setUserRows]         = useState([])

  useEffect(() => {
    if (!orgLoading) fetchAll()
  }, [orgLoading])

  async function fetchAll() {
    setLoading(true)
    const now = new Date()
    try {
      const [profilesRes, orgsRes, invoicesRes, subsRes, membersRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, created_at'),
        supabase.from('organizations').select('id, name, created_at'),
        supabase.from('invoices').select('id, org_id, status, total, date'),
        supabase.from('org_subscriptions').select('org_id, status, created_at, plan:plan_id(name, price_monthly)'),
        supabase.from('organization_members').select('user_id, role, org_id, organizations(id, name), profiles(full_name, created_at)'),
      ])

      const profiles  = profilesRes.data  || []
      const orgs      = orgsRes.data      || []
      const invoices  = invoicesRes.data  || []
      const subs      = subsRes.data      || []
      const members   = membersRes.data   || []

      // ── 30-day window ──
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const newOrgs  = orgs.filter(o => new Date(o.created_at) >= cutoff).length
      const newUsers = profiles.filter(p => new Date(p.created_at) >= cutoff).length

      // ── Invoice stats ──
      const paid    = invoices.filter(i => i.status === 'paid')
      const outstanding = invoices.filter(i => ['sent','partial'].includes(i.status))
      const totalRevenue  = paid.reduce((s, i) => s + Number(i.total || 0), 0)
      const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total || 0), 0)
      const paymentRate = invoices.length ? (paid.length / invoices.length * 100) : 0

      // ── Plan breakdown ──
      const planMap = {}
      subs.forEach(s => {
        const name = s.plan?.name || 'free'
        if (!planMap[name]) planMap[name] = { name, count: 0, price: s.plan?.price_monthly || PLAN_PRICES[name] || 0, active: 0 }
        planMap[name].count++
        if (s.status === 'active') planMap[name].active++
      })
      const planBreakdown = Object.values(planMap).sort((a, b) => b.count - a.count)
      const mrr = planBreakdown.reduce((s, p) => s + p.price * p.active, 0)
      const arr = mrr * 12
      const paidOrgs = planBreakdown.filter(p => p.name !== 'free').reduce((s, p) => s + p.active, 0)

      // ── Revenue chart (last 6 months) ──
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5 + i, 1))
        return { month: d.getUTCMonth(), year: d.getUTCFullYear(), label: MONTH_NAMES[d.getUTCMonth()], total: 0 }
      })
      paid
        .filter(i => i.date)
        .forEach(i => {
          const d = new Date(i.date + 'T00:00:00Z')
          const slot = months.find(m => m.month === d.getUTCMonth() && m.year === d.getUTCFullYear())
          if (slot) slot.total += Number(i.total || 0)
        })

      // ── Org signup chart (last 6 months) ──
      const signupMonths = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5 + i, 1))
        return { month: d.getUTCMonth(), year: d.getUTCFullYear(), label: MONTH_NAMES[d.getUTCMonth()], count: 0 }
      })
      orgs.forEach(o => {
        if (!o.created_at) return
        const d = new Date(o.created_at)
        const slot = signupMonths.find(m => m.month === d.getUTCMonth() && m.year === d.getUTCFullYear())
        if (slot) slot.count++
      })

      // ── Recent orgs (last 10) ──
      const subByOrg = Object.fromEntries(subs.map(s => [s.org_id, s]))
      const recentOrgs = [...orgs]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
        .map(o => ({
          ...o,
          plan: subByOrg[o.id]?.plan?.name || 'free',
          subStatus: subByOrg[o.id]?.status || 'active',
        }))

      // ── Top orgs by invoice revenue ──
      const orgRevMap = {}
      paid.forEach(i => { orgRevMap[i.org_id] = (orgRevMap[i.org_id] || 0) + Number(i.total || 0) })
      const topOrgs = orgs
        .map(o => ({ ...o, revenue: orgRevMap[o.id] || 0, plan: subByOrg[o.id]?.plan?.name || 'free' }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)

      // ── User rows ──
      const userRows = members.map(m => ({
        userId:  m.user_id,
        name:    m.profiles?.full_name || '—',
        orgName: m.organizations?.name || '—',
        orgId:   m.org_id,
        role:    m.role,
        plan:    subByOrg[m.org_id]?.plan?.name || 'free',
        joined:  m.profiles?.created_at,
      }))

      setStats({ totalOrgs: orgs.length, totalUsers: profiles.length, newOrgs, newUsers, totalRevenue, totalOutstanding, paymentRate, paidOrgs, mrr, arr, totalInvoices: invoices.length, paidInvoices: paid.length })
      setPlanBreakdown(planBreakdown)
      setChartData(months)
      setSignupChart(signupMonths)
      setRecentOrgs(recentOrgs)
      setTopOrgs(topOrgs)
      setUserRows(userRows)

    } catch (err) {
      console.error('Analytics error:', err)
    } finally {
      setLoading(false)
    }
  }

  const chartMax  = Math.max(...chartData.map(m => m.total), 1)
  const signupMax = Math.max(...signupChart.map(m => m.count), 1)

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="ga"><div className="ga-spinner" /></div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div className="ga">

        {/* Header */}
        <div className="ga-header">
          <div>
            <div className="ga-title">Owner Analytics</div>
            <div className="ga-subtitle">invoice.digital1now.com — platform-wide metrics</div>
          </div>
          <button className="ga-back" onClick={() => navigate('/admin')}>← Admin Panel</button>
        </div>

        {/* Helcim notice */}
        <div className="ga-helcim">
          ⚠ Payment verification via Helcim is not yet connected. MRR figures below are estimated from plan assignments only.
        </div>

        {/* MRR Banner */}
        <div className="ga-mrr">
          <div>
            <div className="ga-mrr-label">Estimated MRR</div>
            <div className="ga-mrr-value">{fmt(stats.mrr)}</div>
            <div className="ga-mrr-note">Based on active paid subscriptions · Helcim payment confirmation pending</div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="ga-mrr-pill">
              <div className="ga-mrr-pill-label">ARR</div>
              <div className="ga-mrr-pill-value">{fmt(stats.arr)}</div>
            </div>
            <div className="ga-mrr-pill">
              <div className="ga-mrr-pill-label">Paid orgs</div>
              <div className="ga-mrr-pill-value">{stats.paidOrgs}</div>
            </div>
            <div className="ga-mrr-pill">
              <div className="ga-mrr-pill-label">Free orgs</div>
              <div className="ga-mrr-pill-value">{stats.totalOrgs - stats.paidOrgs}</div>
            </div>
          </div>
        </div>

        {/* Top stats */}
        <div className="ga-grid">
          <div className="ga-stat">
            <div className="ga-stat-label">Organizations</div>
            <div className="ga-stat-value">{stats.totalOrgs}</div>
            <div className="ga-stat-note"><b>{stats.newOrgs}</b> new in last 30 days</div>
          </div>
          <div className="ga-stat">
            <div className="ga-stat-label">Users</div>
            <div className="ga-stat-value">{stats.totalUsers}</div>
            <div className="ga-stat-note"><b>{stats.newUsers}</b> new in last 30 days</div>
          </div>
          <div className="ga-stat">
            <div className="ga-stat-label">Invoice revenue</div>
            <div className="ga-stat-value">{fmt(stats.totalRevenue)}</div>
            <div className="ga-stat-note">Across all orgs · paid invoices only</div>
          </div>
          <div className="ga-stat">
            <div className="ga-stat-label">Payment rate</div>
            <div className="ga-stat-value">{Math.round(stats.paymentRate)}%</div>
            <div className="ga-stat-note"><b>{stats.paidInvoices}</b> paid of <b>{stats.totalInvoices}</b> invoices</div>
          </div>
        </div>

        {/* Charts row */}
        <div className="ga-two">
          {/* Revenue chart */}
          <div className="ga-panel">
            <div className="ga-panel-header">
              <span className="ga-panel-title">Invoice revenue — last 6 months</span>
            </div>
            <div className="ga-chart">
              {chartData.map((m, i) => (
                <div className="ga-chart-col" key={i}>
                  <div className="ga-chart-value">{m.total > 0 ? fmt(m.total).replace('CA$','$') : ''}</div>
                  <div className="ga-chart-bar-wrap">
                    <div className={`ga-chart-bar ${m.total === 0 ? 'ga-chart-bar--empty' : ''}`}
                      style={{ height: `${Math.max(m.total / chartMax * 100, m.total > 0 ? 8 : 4)}%` }}
                      title={`${m.label}: ${fmt(m.total)}`} />
                  </div>
                  <div className="ga-chart-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Org signup chart */}
          <div className="ga-panel">
            <div className="ga-panel-header">
              <span className="ga-panel-title">New org signups — last 6 months</span>
            </div>
            <div className="ga-chart">
              {signupChart.map((m, i) => (
                <div className="ga-chart-col" key={i}>
                  <div className="ga-chart-value">{m.count > 0 ? m.count : ''}</div>
                  <div className="ga-chart-bar-wrap">
                    <div className={`ga-chart-bar ${m.count === 0 ? 'ga-chart-bar--empty' : ''}`}
                      style={{ height: `${Math.max(m.count / signupMax * 100, m.count > 0 ? 8 : 4)}%` }}
                      title={`${m.label}: ${m.count} signups`} />
                  </div>
                  <div className="ga-chart-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="ga-panel">
          <div className="ga-panel-header">
            <span className="ga-panel-title">Plan breakdown</span>
          </div>
          {planBreakdown.length === 0 ? (
            <div className="ga-empty">No subscription data yet.</div>
          ) : (
            <table className="ga-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th style={{ textAlign: 'right' }}>Orgs</th>
                  <th style={{ textAlign: 'right' }}>Active</th>
                  <th style={{ textAlign: 'right' }}>Price/mo</th>
                  <th style={{ textAlign: 'right' }}>Est. MRR</th>
                  <th style={{ textAlign: 'right' }}>Helcim verified</th>
                </tr>
              </thead>
              <tbody>
                {planBreakdown.map(p => (
                  <tr key={p.name}>
                    <td><span className={`ga-plan ga-plan--${p.name}`}>{p.name}</span></td>
                    <td style={{ textAlign: 'right' }}>{p.count}</td>
                    <td style={{ textAlign: 'right' }}>{p.active}</td>
                    <td style={{ textAlign: 'right' }}>{p.price > 0 ? fmt(p.price) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.price > 0 ? fmt(p.price * p.active) : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#d97706', fontSize: 11 }}>Pending</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent signups */}
        <div className="ga-panel">
          <div className="ga-panel-header">
            <span className="ga-panel-title">Recent organization signups</span>
          </div>
          {recentOrgs.length === 0 ? (
            <div className="ga-empty">No organizations yet.</div>
          ) : (
            <table className="ga-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Subscription status</th>
                  <th>Payment</th>
                  <th style={{ textAlign: 'right' }}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {recentOrgs.map(o => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td><span className={`ga-plan ga-plan--${o.plan}`}>{o.plan}</span></td>
                    <td style={{ textTransform: 'capitalize' }}>{o.subStatus}</td>
                    <td style={{ color: '#d97706', fontSize: 12 }}>
                      {o.plan === 'free' ? '—' : '⏳ Helcim pending'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Two col: top orgs + users */}
        <div className="ga-two">
          {/* Top orgs by revenue */}
          <div className="ga-panel">
            <div className="ga-panel-header">
              <span className="ga-panel-title">Top orgs by invoice revenue</span>
            </div>
            {topOrgs.length === 0 ? (
              <div className="ga-empty">No revenue data yet.</div>
            ) : (
              <table className="ga-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Plan</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topOrgs.map(o => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td><span className={`ga-plan ga-plan--${o.plan}`}>{o.plan}</span></td>
                      <td style={{ textAlign: 'right' }}>{fmt(o.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Users */}
          <div className="ga-panel">
            <div className="ga-panel-header">
              <span className="ga-panel-title">All users</span>
            </div>
            {userRows.length === 0 ? (
              <div className="ga-empty">No users yet.</div>
            ) : (
              <table className="ga-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organization</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'right' }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((r, i) => (
                    <tr key={`${r.userId}-${i}`}>
                      <td>{r.name}</td>
                      <td style={{ color: '#94a3b8' }}>{r.orgName}</td>
                      <td style={{ textTransform: 'capitalize', color: '#94a3b8' }}>{r.role}</td>
                      <td style={{ textAlign: 'right' }}>{fmtDate(r.joined)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </>
  )
}
