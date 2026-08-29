// src/pages/PurchaseOrders.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import SuspendedBanner from '../components/SuspendedBanner'

const css = `
  .po-root {
    --teal:      #0d7377;
    --teal-lt:   #e8f5f5;
    --teal-mid:  #14a0a5;
    --slate:     #1e293b;
    --slate-mid: #475569;
    --slate-lt:  #94a3b8;
    --border:    #e2e8f0;
    --bg:        #f1f5f9;
    --white:     #ffffff;
    --red:       #e53e3e;
    --amber:     #d97706;
    --green:     #059669;
    --blue:      #2563eb;
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 28px 24px 60px;
  }

  .po-header {
    max-width: 1100px; margin: 0 auto 24px;
    display: flex; align-items: flex-end;
    justify-content: space-between; flex-wrap: wrap; gap: 16px;
  }
  .po-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px; font-weight: 600; color: var(--slate);
    letter-spacing: -0.02em; line-height: 1.1;
  }
  .po-subtitle { font-size: 13px; color: var(--slate-lt); margin-top: 3px; }

  .po-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
    font-family: 'DM Sans', sans-serif; border: 1.5px solid var(--border);
    background: var(--white); color: var(--slate-mid);
    cursor: pointer; transition: all .15s; white-space: nowrap;
  }
  .po-btn:hover { border-color: var(--slate-lt); color: var(--slate); background: #f8fafc; }
  .po-btn--primary { background: var(--teal); color: white; border-color: var(--teal); }
  .po-btn--primary:hover { background: var(--teal-mid); border-color: var(--teal-mid); color: white; }
  .po-btn--danger { color: var(--red); border-color: #fecaca; }
  .po-btn--danger:hover { background: #fff5f5; border-color: var(--red); }
  .po-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .po-panel {
    max-width: 1100px; margin: 0 auto 20px;
    background: var(--white); border-radius: 14px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;
  }

  .po-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .po-table th {
    padding: 10px 18px; font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--slate-lt); background: #f8fafc;
    border-bottom: 1px solid var(--border); text-align: left;
  }
  .po-table td { padding: 12px 18px; border-bottom: 1px solid #f8fafc; color: var(--slate-mid); vertical-align: middle; }
  .po-table tbody tr:last-child td { border-bottom: none; }
  .po-table tbody tr:hover { background: #f8fafc; cursor: pointer; }
  .po-table td:first-child { color: var(--slate); font-weight: 500; }

  .po-badge {
    display: inline-flex; align-items: center;
    padding: 2px 9px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .po-badge--draft     { background: #f1f5f9; color: #94a3b8; }
  .po-badge--sent      { background: #eff6ff; color: #2563eb; }
  .po-badge--received  { background: #f0fdf4; color: #059669; }
  .po-badge--canceled  { background: #fff5f5; color: #e53e3e; }

  .po-empty { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--slate-lt); }

  .po-spinner {
    width: 28px; height: 28px; border: 2.5px solid var(--border);
    border-top-color: var(--teal); border-radius: 50%;
    animation: pospin .7s linear infinite; margin: 60px auto;
  }
  @keyframes pospin { to { transform: rotate(360deg); } }
`

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', received: 'Received', canceled: 'Canceled' }

export default function PurchaseOrders() {
  const { activeOrg, isSuspended } = useOrg()
  const navigate = useNavigate()
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeOrg?.orgId) fetchPOs()
  }, [activeOrg?.orgId])

  async function fetchPOs() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, vendors(name)')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
    setPos(data || [])
    setLoading(false)
  }

  async function createPO() {
    const { data: lastPO } = await supabase
      .from('purchase_orders')
      .select('number')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastNum = lastPO?.[0]?.number
      ? parseInt(lastPO[0].number.replace(/\D/g, '')) || 0
      : 0
    const newNumber = `PO-${String(lastNum + 1).padStart(4, '0')}`

    const { data: newPO, error } = await supabase
      .from('purchase_orders')
      .insert([{
        org_id: activeOrg.orgId,
        number: newNumber,
        date: new Date().toISOString().split('T')[0],
        status: 'draft',
      }])
      .select().single()

    if (error) return alert('Failed to create PO: ' + error.message)
    navigate(`/purchase-orders/${newPO.id}`)
  }

  async function deletePO(e, po) {
    e.stopPropagation()
    if (!window.confirm(`Delete ${po.number || 'this purchase order'}? This cannot be undone.`)) return
    await supabase.from('purchase_orders').delete().eq('id', po.id).eq('org_id', activeOrg.orgId)
    fetchPOs()
  }

  return (
    <>
      <style>{css}</style>
      <div className="po-root">
        <div className="po-header">
          <div>
            <div className="po-title">Purchase Orders</div>
            <div className="po-subtitle">{pos.length} purchase order{pos.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="po-btn po-btn--primary" onClick={createPO} disabled={isSuspended}>
            + New Purchase Order
          </button>
        </div>
        <SuspendedBanner />

        <div className="po-panel">
          {loading ? (
            <div className="po-spinner" />
          ) : pos.length === 0 ? (
            <div className="po-empty">No purchase orders yet. Create one to send to a vendor.</div>
          ) : (
            <table className="po-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th>Expected</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <td>{po.number || '—'}</td>
                    <td>{po.vendors?.name || '—'}</td>
                    <td>{fmtDate(po.date)}</td>
                    <td>{po.expected_date ? fmtDate(po.expected_date) : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(po.total)}</td>
                    <td><span className={`po-badge po-badge--${po.status}`}>{STATUS_LABELS[po.status] || po.status}</span></td>
                    <td>
                      <button className="po-btn po-btn--danger" style={{ fontSize: 12, padding: '5px 10px' }} onClick={(e) => deletePO(e, po)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
