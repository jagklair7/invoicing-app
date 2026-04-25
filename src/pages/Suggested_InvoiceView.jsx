import { exportInvoicePDF } from '../utils/exportInvoicePDF'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { calcLineTotal, calcLineDiscount } from '../utils/discount'

// ... (keep your existing const css block here) ...

const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const today = () => new Date().toISOString().split('T')[0]

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' }

function StatusBadge({ status, edit, value, onChange }) {
  if (edit) return (
    <select className="inv-input inv-select" value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '5px 28px 5px 10px', borderRadius: 20, width: 'auto' }}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
  return <span className={`inv-status inv-status--${status}`}>{STATUS_LABELS[status] || status}</span>
}

export default function InvoiceView() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState({ number: '', date: today(), status: 'draft' })
  const [customer, setCustomer] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Edit state
  const [editNumber, setEditNumber] = useState('') // Specifically for the editable Invoice No.
  const [editStatus, setEditStatus] = useState('draft')
  const [editDate, setEditDate] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editItems, setEditItems] = useState([])

  async function fetchInvoice() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(*), invoice_items(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      if (!data) return
      setInvoice(data)
      setCustomer(data.customers)
      setItems(data.invoice_items ?? [])
      
      // Initialize edit states
      setEditNumber(data.number)
      setEditStatus(data.status)
      setEditDate(data.date || today())
      setEditDue(data.due_date || '')
      setEditItems(data.invoice_items ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInvoice() }, [id])

  // Helpers
  function addItem() {
    setEditItems(prev => [...prev, { 
      id: `new-${Date.now()}`, 
      name: '', 
      quantity: 1, 
      unit_price: 0,
      discount_type: 'none',
      discount_value: 0,
    }])
  }

  function removeItem(idx) { setEditItems(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx, field, val) {
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function cancelEdit() {
    setEditItems(items)
    setEditNumber(invoice?.number)
    setEditStatus(invoice?.status || 'draft')
    setEditDate(invoice?.date || today())
    setEditDue(invoice?.due_date || '')
    setIsEditing(false)
  }

  const editSubtotal = editItems.reduce((s, i) => s + calcLineTotal(i), 0)
  const editTax = editSubtotal * 0.05
  const editTotal = editSubtotal + editTax

  async function saveChanges() {
    setSaving(true)
    try {
      const { error: invErr } = await supabase
        .from('invoices')
        .update({ 
          number: editNumber, // Save the manual number override
          status: editStatus, 
          date: editDate, 
          due_date: editDue || null, 
          subtotal: editSubtotal, 
          tax: editTax, 
          total: editTotal 
        })
        .eq('id', id)
      if (invErr) throw invErr

      await supabase.from('invoice_items').delete().eq('invoice_id', id)

      const validItems = editItems.filter(i => i.name?.trim())
      if (validItems.length > 0) {
        const { error: insErr } = await supabase
          .from('invoice_items')
          .insert(validItems.map(i => ({
            invoice_id: id,
            name: i.name.trim(),
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            discount_type: i.discount_type || 'none',
            discount_value: Number(i.discount_value) || 0,
          })))
        if (insErr) throw insErr
      }

      setIsEditing(false)
      await fetchInvoice()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      await exportInvoicePDF(invoice, customer, items)
    } catch (err) {
      alert('PDF export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="inv-root"><div className="inv-loading"><div className="inv-spinner" /></div></div>

  return (
    <>
      <style>{css}</style>
      <div className="inv-root">
        {/* Topbar logic remains the same... */}
        <div className="inv-topbar">
          <button className="inv-back" onClick={() => navigate('/invoices')}>← Back to Invoices</button>
          <div className="inv-topbar-actions">
            {isEditing ? (
              <button className="inv-btn inv-btn--primary" onClick={saveChanges} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            ) : (
              <button className="inv-btn inv-btn--primary" onClick={() => setIsEditing(true)}>Edit Invoice</button>
            )}
            <button className="inv-btn" onClick={handleExportPDF} disabled={exporting}>PDF</button>
          </div>
        </div>

        <div className="inv-card">
          <div className="inv-header">
            <div className="inv-brand">
              <div className="inv-brand-name">INVOICE</div>
            </div>
            <div className="inv-header-right">
              <div className="inv-number-label">Invoice No.</div>
              {isEditing ? (
                <input 
                  className="inv-input" 
                  style={{ color: 'white', background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: '20px' }}
                  value={editNumber} 
                  onChange={e => setEditNumber(e.target.value)} 
                />
              ) : (
                <div className="inv-number-value">{invoice?.number}</div>
              )}
            </div>
          </div>

          <div className="inv-body">
            {/* View Mode Table logic is correct in your snippet */}
            {!isEditing && (
               /* ... (render your standard table) ... */
               <div>{/* View items here */}</div>
            )}

            {/* Fixed Edit Mode Table */}
            {isEditing && (
              <div className="inv-edit-section">
                <div className="inv-items-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px 36px', gap: '8px' }}>
                  <span className="inv-items-col-label">Description</span>
                  <span className="inv-items-col-label">Qty</span>
                  <span className="inv-items-col-label">Price</span>
                  <span className="inv-items-col-label">Discount</span>
                </div>
                {editItems.map((item, idx) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px 36px', gap: '8px', marginBottom: '8px' }}>
                    <input className="inv-item-input" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
                    <input className="inv-item-input" type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    <input className="inv-item-input" type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <input className="inv-item-input" type="number" style={{ width: '50px' }} value={item.discount_value} onChange={e => updateItem(idx, 'discount_value', e.target.value)} />
                      <select className="inv-item-input" value={item.discount_type} onChange={e => updateItem(idx, 'discount_type', e.target.value)}>
                        <option value="none">None</option>
                        <option value="percent">%</option>
                        <option value="fixed">$</option>
                      </select>
                    </div>
                    <button className="inv-item-del" onClick={() => removeItem(idx)}>×</button>
                  </div>
                ))}
                <button className="inv-add-item" onClick={addItem}>+ Add Line Item</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}