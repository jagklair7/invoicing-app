// src/pages/PurchaseOrderView.jsx
import { exportPurchaseOrderPDF } from '../utils/exportPurchaseOrderPDF'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  .po-view-root {
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
    --green:     #059669;
    --radius:    12px;
    --shadow:    0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 24px 16px 60px;
  }

  .po-topbar {
    max-width: 860px; margin: 0 auto 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .po-back {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 500; color: var(--slate-mid);
    background: none; border: none; cursor: pointer; padding: 6px 0;
    transition: color .15s; font-family: 'DM Sans', sans-serif;
  }
  .po-back:hover { color: var(--teal); }
  .po-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

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
  .po-btn--ghost { background: transparent; border-color: transparent; color: var(--slate-mid); }
  .po-btn--ghost:hover { background: var(--border); color: var(--slate); }
  .po-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .po-card {
    background: var(--white); border-radius: var(--radius);
    box-shadow: var(--shadow); max-width: 860px; margin: 0 auto; overflow: hidden;
  }

  .po-header-band {
    background: linear-gradient(135deg, var(--slate) 0%, #2d3f55 100%);
    padding: 36px 44px 32px;
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 24px; flex-wrap: wrap;
  }
  .po-brand-name {
    font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 600;
    color: white; letter-spacing: -0.02em; line-height: 1;
  }
  .po-brand-tagline {
    font-size: 12px; color: rgba(255,255,255,0.45);
    letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px;
  }
  .po-header-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .po-number-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
  .po-number-value {
    font-family: 'Fraunces', Georgia, serif; font-size: 26px; font-weight: 300;
    color: white; letter-spacing: 0.02em; margin-top: -2px;
  }

  .po-status {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px; border-radius: 20px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .po-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.7; }
  .po-status--draft     { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
  .po-status--sent      { background: rgba(37,99,235,0.2);   color: #93c5fd; }
  .po-status--received  { background: rgba(5,150,105,0.2);   color: #6ee7b7; }
  .po-status--canceled  { background: rgba(229,62,62,0.15);  color: #fca5a5; }

  .po-body { padding: 36px 44px; }

  .po-meta-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
    padding-bottom: 32px; border-bottom: 1.5px solid var(--border); margin-bottom: 32px;
  }
  .po-meta-section-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--teal); margin-bottom: 10px;
  }
  .po-vendor-name {
    font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 600;
    color: var(--slate); margin-bottom: 4px; letter-spacing: -0.01em;
  }
  .po-vendor-detail { font-size: 13px; color: var(--slate-mid); line-height: 1.7; }

  .po-dates-grid { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
  .po-date-row { display: flex; gap: 16px; align-items: baseline; }
  .po-date-label { font-size: 12px; color: var(--slate-lt); min-width: 80px; text-align: right; }
  .po-date-value { font-size: 13px; font-weight: 500; color: var(--slate); min-width: 100px; text-align: right; }

  .po-field { display: flex; flex-direction: column; gap: 5px; }
  .po-field-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-lt); }
  .po-input {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--slate);
    background: white; border: 1.5px solid var(--border); border-radius: 8px;
    padding: 8px 11px; outline: none; transition: border-color .15s, box-shadow .15s; width: 100%;
  }
  .po-input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(13,115,119,0.1); }
  .po-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; cursor: pointer;
  }

  .po-edit-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-bottom: 28px; border-bottom: 1.5px solid var(--border); margin-bottom: 28px; }
  .po-edit-meta-right { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-content: start; }

  .po-items-cols {
    display: grid; grid-template-columns: 1fr 90px 110px 36px; gap: 8px;
    padding: 0 0 6px; border-bottom: 1px solid var(--border); margin-bottom: 4px;
  }
  .po-items-col-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-lt); }
  .po-items-col-label--r { text-align: right; }

  .po-item-row {
    display: grid; grid-template-columns: 1fr 90px 110px 36px; gap: 8px;
    align-items: center; margin-bottom: 6px;
  }
  .po-item-input {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--slate);
    background: #f8fafc; border: 1.5px solid transparent; border-radius: 6px;
    padding: 7px 9px; outline: none; transition: all .15s; width: 100%;
  }
  .po-item-input:focus { background: white; border-color: var(--teal); box-shadow: 0 0 0 3px rgba(13,115,119,0.08); }
  .po-item-input--num { text-align: right; font-variant-numeric: tabular-nums; }

  .po-item-del {
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    background: none; border: 1.5px solid transparent; border-radius: 6px; cursor: pointer;
    color: var(--slate-lt); font-size: 16px; transition: all .12s; flex-shrink: 0;
  }
  .po-item-del:hover { color: var(--red); background: #fff5f5; border-color: #fecaca; }

  .po-add-item {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 12px;
    font-size: 13px; font-weight: 500; color: var(--teal); background: var(--teal-lt);
    border: 1.5px dashed #b2e0e2; border-radius: 8px; padding: 8px 14px; cursor: pointer;
    transition: all .15s; width: 100%; justify-content: center; font-family: 'DM Sans', sans-serif;
  }
  .po-add-item:hover { background: #d0eeef; border-color: var(--teal); }

  .po-totals {
    margin-top: 20px; padding-top: 20px; border-top: 1.5px solid var(--border);
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  }
  .po-total-row { display: flex; gap: 48px; align-items: baseline; }
  .po-total-label { font-size: 12px; color: var(--slate-lt); min-width: 80px; text-align: right; }
  .po-total-value { font-size: 14px; color: var(--slate-mid); min-width: 100px; text-align: right; font-variant-numeric: tabular-nums; }
  .po-total-row--grand .po-total-label { font-size: 13px; font-weight: 600; color: var(--slate); }
  .po-total-row--grand .po-total-value {
    font-family: 'Fraunces', Georgia, serif; font-size: 26px; font-weight: 600; color: var(--teal);
  }
  .po-total-row--paid .po-total-value { color: var(--green); }
  .po-total-row--balance .po-total-value { font-weight: 600; }
  .po-total-row--balance .po-total-value--zero { color: var(--green); }
  .po-total-row--balance .po-total-value--due { color: var(--red); }
  .po-total-divider { width: 260px; height: 1px; background: var(--border); margin: 4px 0; }

  .po-empty-items { text-align: center; padding: 32px; color: var(--slate-lt); font-size: 13px; border: 1.5px dashed var(--border); border-radius: 10px; }

  .po-loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; flex-direction: column; gap: 16px; }
  .po-spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--teal); border-radius: 50%; animation: pospin2 .7s linear infinite; }
  @keyframes pospin2 { to { transform: rotate(360deg); } }

  @media (max-width: 600px) {
    .po-header-band { padding: 24px 20px 20px; }
    .po-body { padding: 24px 20px; }
    .po-meta-row { grid-template-columns: 1fr; gap: 20px; }
    .po-edit-meta { grid-template-columns: 1fr; }
    .po-edit-meta-right { grid-template-columns: 1fr 1fr; }
    .po-item-row, .po-items-cols { grid-template-columns: 1fr 70px 90px 28px; }
  }
`

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const today = () => new Date().toISOString().split('T')[0]

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', received: 'Received', canceled: 'Canceled' }
const PAYMENT_METHODS = ['Cash', 'Cheque', 'EFT', 'Credit Card']

function StatusBadge({ status, edit, value, onChange }) {
  if (edit) return (
    <select className="po-input po-select" value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '5px 28px 5px 10px', borderRadius: 20, width: 'auto' }}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
  return <span className={`po-status po-status--${status}`}>{STATUS_LABELS[status] || status}</span>
}

export default function PurchaseOrderView() {
  const { activeOrg } = useOrg()
  const { id } = useParams()
  const navigate = useNavigate()

  const [po, setPo] = useState(null)
  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [editVendorId, setEditVendorId] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [editStatus, setEditStatus] = useState('draft')
  const [editDate, setEditDate] = useState(today())
  const [editExpected, setEditExpected] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editItems, setEditItems] = useState([])
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editAmountPaid, setEditAmountPaid] = useState('')

  async function fetchPO() {
    if (!activeOrg?.orgId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, vendors(*)')
        .eq('id', id)
        .eq('org_id', activeOrg.orgId)
        .single()
      if (error) throw error

      const { data: vendorList } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('org_id', activeOrg.orgId)
        .order('name')
      setVendors(vendorList || [])

      const { data: productList } = await supabase
        .from('products')
        .select('id, name, description, unit_price')
        .eq('org_id', activeOrg.orgId)
        .order('name')
      setProducts(productList || [])

      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id)

      setPo(data)
      setEditVendorId(data.vendor_id || '')
      setEditNumber(data.number || '')
      setEditStatus(data.status || 'draft')
      setEditDate(data.date || today())
      setEditExpected(data.expected_date || '')
      setEditNotes(data.notes || '')
      setEditItems(items || [])
      setEditPaymentMethod(data.payment_method || '')
      setEditAmountPaid(data.amount_paid != null ? String(data.amount_paid) : '0')

      // New POs with no line items open straight into edit mode
      if (!items || items.length === 0) setIsEditing(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeOrg?.orgId) fetchPO()
  }, [id, activeOrg?.orgId])

  function addItem() {
    setEditItems(prev => [...prev, {
      id: `new-${Date.now()}`,
      product_id: '',
      name: '',
      quantity: 1,
      unit_price: '',
    }])
  }
  function removeItem(idx) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }
  function updateItem(idx, field, val) {
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }
  function handleProductSelect(idx, productId) {
    const product = products.find(p => p.id === productId)
    setEditItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      return {
        ...it,
        product_id: productId,
        name:       product?.description?.trim() || product?.name || '',
        unit_price: product?.unit_price || 0,
      }
    }))
  }

  function cancelEdit() {
    setEditVendorId(po.vendor_id || '')
    setEditNumber(po.number || '')
    setEditStatus(po.status || 'draft')
    setEditDate(po.date || today())
    setEditExpected(po.expected_date || '')
    setEditNotes(po.notes || '')
    setEditPaymentMethod(po.payment_method || '')
    setEditAmountPaid(po.amount_paid != null ? String(po.amount_paid) : '0')
    setIsEditing(false)
    fetchPO()
  }

  const editSubtotal = editItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const editTax      = editSubtotal * 0.05
  const editTotal    = editSubtotal + editTax
  const editBalance  = editTotal - (Number(editAmountPaid) || 0)

  async function saveChanges() {
    setSaving(true)
    try {
      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({
          vendor_id:      editVendorId || null,
          number:         editNumber,
          status:         editStatus,
          date:           editDate,
          expected_date:  editExpected || null,
          notes:          editNotes,
          subtotal:       editSubtotal,
          tax:            editTax,
          total:          editTotal,
          payment_method: editPaymentMethod || null,
          amount_paid:    Number(editAmountPaid) || 0,
        })
        .eq('id', id)
        .eq('org_id', activeOrg.orgId)
      if (poErr) throw poErr

      await supabase.from('purchase_order_items').delete().eq('po_id', id)

      const validItems = editItems.filter(i => i.name?.trim() && Number(i.quantity) > 0)
      if (validItems.length > 0) {
        const { error: insErr } = await supabase
          .from('purchase_order_items')
          .insert(validItems.map(i => ({
            po_id:       id,
            org_id:      activeOrg.orgId,
            product_id:  i.product_id || null,
            name:        i.name.trim(),
            quantity:    Number(i.quantity),
            unit_price:  Number(i.unit_price) || 0,
          })))
        if (insErr) throw insErr
      }

      setIsEditing(false)
      await fetchPO()
    } catch (err) {
      console.error('Save failed:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deletePO() {
    if (!window.confirm('Delete this purchase order? This cannot be undone.')) return
    await supabase.from('purchase_orders').delete().eq('id', id).eq('org_id', activeOrg.orgId)
    navigate('/purchase-orders')
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      const vendor = vendors.find(v => v.id === (po.vendor_id))
      await exportPurchaseOrderPDF(po, vendor, editItems.length ? editItems : [], activeOrg.orgId)
    } catch (err) {
      alert('PDF export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading || !po) return (
    <>
      <style>{css}</style>
      <div className="po-view-root">
        <div className="po-loading">
          <div className="po-spinner" />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Loading purchase order…</span>
        </div>
      </div>
    </>
  )

  const selectedVendor = vendors.find(v => v.id === editVendorId)
  const viewBalance = (po.total || 0) - (po.amount_paid || 0)

  return (
    <>
      <style>{css}</style>
      <div className="po-view-root">

        <div className="po-topbar">
          <button className="po-back" onClick={() => navigate('/purchase-orders')}>← Back to Purchase Orders</button>
          <div className="po-topbar-actions">
            {isEditing ? (
              <>
                <button className="po-btn po-btn--primary" onClick={saveChanges} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="po-btn po-btn--danger" onClick={deletePO}>Delete</button>
                <button className="po-btn po-btn--ghost" onClick={cancelEdit}>Cancel</button>
              </>
            ) : (
              <>
                <button className="po-btn" onClick={handleExportPDF} disabled={exporting}>
                  {exporting ? 'Generating…' : '↓ Export PDF'}
                </button>
                <button className="po-btn po-btn--primary" onClick={() => setIsEditing(true)}>Edit Purchase Order</button>
              </>
            )}
          </div>
        </div>

        <div className="po-card">
          <div className="po-header-band">
            <div>
              <div className="po-brand-name">PURCHASE ORDER</div>
              <div className="po-brand-tagline">{activeOrg?.name}</div>
            </div>
            <div className="po-header-right">
              <div>
                <div className="po-number-label">PO No.</div>
                {isEditing ? (
                  <input className="po-input" value={editNumber} onChange={e => setEditNumber(e.target.value)}
                    style={{
                      fontSize: 20, fontFamily: "'Fraunces', Georgia, serif", fontWeight: 300, color: 'white',
                      background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.25)',
                      borderRadius: 8, padding: '6px 12px', width: 160, letterSpacing: '0.02em',
                    }} />
                ) : (
                  <div className="po-number-value">{po.number}</div>
                )}
              </div>
              <StatusBadge status={po.status} edit={isEditing} value={editStatus} onChange={setEditStatus} />
            </div>
          </div>

          <div className="po-body">
            {!isEditing ? (
              <>
                <div className="po-meta-row">
                  <div>
                    <div className="po-meta-section-label">Vendor</div>
                    <div className="po-vendor-name">{po.vendors?.name || '—'}</div>
                    <div className="po-vendor-detail">
                      {po.vendors?.email && <div>{po.vendors.email}</div>}
                      {po.vendors?.phone && <div>{po.vendors.phone}</div>}
                      {po.vendors?.address && <div>{po.vendors.address}</div>}
                    </div>
                  </div>
                  <div className="po-dates-grid">
                    <div className="po-meta-section-label" style={{ textAlign: 'right' }}>Order Details</div>
                    <div className="po-date-row">
                      <span className="po-date-label">Order Date</span>
                      <span className="po-date-value">{fmtDate(po.date)}</span>
                    </div>
                    <div className="po-date-row">
                      <span className="po-date-label">Expected</span>
                      <span className="po-date-value">{po.expected_date ? fmtDate(po.expected_date) : '—'}</span>
                    </div>
                    <div className="po-date-row">
                      <span className="po-date-label">Payment Method</span>
                      <span className="po-date-value">{po.payment_method || '—'}</span>
                    </div>
                  </div>
                </div>

                {editItems.length === 0 ? (
                  <div className="po-empty-items">No line items yet. Click Edit Purchase Order to add items.</div>
                ) : (
                  <>
                    <div className="po-items-cols">
                      <span className="po-items-col-label">Description</span>
                      <span className="po-items-col-label po-items-col-label--r">Qty</span>
                      <span className="po-items-col-label po-items-col-label--r">Unit Price</span>
                      <span />
                    </div>
                    {editItems.map((item, i) => (
                      <div key={item.id || i} className="po-item-row" style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 14, color: '#1e293b' }}>{item.name}</div>
                        <div style={{ textAlign: 'right', fontSize: 13, color: '#475569' }}>{item.quantity}</div>
                        <div style={{ textAlign: 'right', fontSize: 13, color: '#475569' }}>{fmt(item.unit_price)}</div>
                        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                          {fmt((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <div className="po-totals">
                  <div className="po-total-row">
                    <span className="po-total-label">Subtotal</span>
                    <span className="po-total-value">{fmt(po.subtotal)}</span>
                  </div>
                  <div className="po-total-row">
                    <span className="po-total-label">Tax (5%)</span>
                    <span className="po-total-value">{fmt(po.tax)}</span>
                  </div>
                  <div className="po-total-divider" />
                  <div className="po-total-row po-total-row--grand">
                    <span className="po-total-label">Total</span>
                    <span className="po-total-value">{fmt(po.total)}</span>
                  </div>
                  <div className="po-total-row po-total-row--paid">
                    <span className="po-total-label">Amount Paid</span>
                    <span className="po-total-value">{fmt(po.amount_paid)}</span>
                  </div>
                  <div className="po-total-row po-total-row--balance">
                    <span className="po-total-label">Balance Due</span>
                    <span className={`po-total-value ${viewBalance <= 0 ? 'po-total-value--zero' : 'po-total-value--due'}`}>
                      {fmt(viewBalance)}
                    </span>
                  </div>
                </div>

                {po.notes && (
                  <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px dashed #e2e8f0' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
                      Notes
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{po.notes}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="po-edit-meta">
                  <div>
                    <div className="po-field-label" style={{ marginBottom: 6 }}>Vendor</div>
                    <select className="po-input po-select" value={editVendorId} onChange={e => setEditVendorId(e.target.value)}>
                      <option value="">Select vendor…</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    {selectedVendor && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                        {selectedVendor.email || selectedVendor.phone || ''}
                      </div>
                    )}
                  </div>
                  <div className="po-edit-meta-right">
                    <div className="po-field">
                      <label className="po-field-label">Order Date</label>
                      <input className="po-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                    </div>
                    <div className="po-field">
                      <label className="po-field-label">Expected Date</label>
                      <input className="po-input" type="date" value={editExpected} onChange={e => setEditExpected(e.target.value)} />
                    </div>
                    <div className="po-field">
                      <label className="po-field-label">Payment Method</label>
                      <select className="po-input po-select" value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)}>
                        <option value="">Select…</option>
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="po-field">
                      <label className="po-field-label">Amount Paid</label>
                      <input
                        className="po-input"
                        type="number" min="0" step="any" placeholder="0.00"
                        value={editAmountPaid}
                        onChange={e => setEditAmountPaid(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="po-items-cols" style={{ gridTemplateColumns: '180px 1fr 70px 100px 36px' }}>
                    <span className="po-items-col-label">Product</span>
                    <span className="po-items-col-label">Description</span>
                    <span className="po-items-col-label po-items-col-label--r">Qty</span>
                    <span className="po-items-col-label po-items-col-label--r">Unit Price</span>
                    <span />
                  </div>

                  {editItems.length === 0 && (
                    <div className="po-empty-items" style={{ marginBottom: 12 }}>No items yet — add one below.</div>
                  )}

                  {editItems.map((item, idx) => (
                    <div key={item.id || idx} className="po-item-row" style={{ gridTemplateColumns: '180px 1fr 70px 100px 36px' }}>
                      <select
                        className="po-item-input po-select"
                        style={{ background: 'white' }}
                        value={item.product_id || ''}
                        onChange={e => handleProductSelect(idx, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input
                        className="po-item-input"
                        placeholder="Description / detail"
                        value={item.name}
                        onChange={e => updateItem(idx, 'name', e.target.value)}
                        style={{ background: 'white' }}
                      />
                      <input
                        className="po-item-input po-item-input--num"
                        type="number" placeholder="1" min="0" step="any"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        style={{ background: 'white' }}
                      />
                      <input
                        className="po-item-input po-item-input--num"
                        type="number" placeholder="0.00" min="0" step="any"
                        value={item.unit_price}
                        onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                        style={{ background: 'white' }}
                      />
                      <button className="po-item-del" onClick={() => removeItem(idx)} title="Remove">×</button>
                    </div>
                  ))}

                  <button className="po-add-item" onClick={addItem}>+ Add Line Item</button>
                </div>

                <div className="po-totals">
                  <div className="po-total-row">
                    <span className="po-total-label">Subtotal</span>
                    <span className="po-total-value">{fmt(editSubtotal)}</span>
                  </div>
                  <div className="po-total-row">
                    <span className="po-total-label">Tax (5%)</span>
                    <span className="po-total-value">{fmt(editTax)}</span>
                  </div>
                  <div className="po-total-divider" />
                  <div className="po-total-row po-total-row--grand">
                    <span className="po-total-label">Total</span>
                    <span className="po-total-value">{fmt(editTotal)}</span>
                  </div>
                  <div className="po-total-row po-total-row--paid">
                    <span className="po-total-label">Amount Paid</span>
                    <span className="po-total-value">{fmt(Number(editAmountPaid) || 0)}</span>
                  </div>
                  <div className="po-total-row po-total-row--balance">
                    <span className="po-total-label">Balance Due</span>
                    <span className={`po-total-value ${editBalance <= 0 ? 'po-total-value--zero' : 'po-total-value--due'}`}>
                      {fmt(editBalance)}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div className="po-field">
                    <label className="po-field-label">Notes</label>
                    <textarea
                      className="po-input"
                      rows={4}
                      placeholder="Delivery instructions, terms, reference numbers..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
