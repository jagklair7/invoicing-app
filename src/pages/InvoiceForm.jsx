// src/pages/InvoiceForm.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { checkCanCreateInvoice } from '../utils/planLimits'
import SuspendedBanner from '../components/SuspendedBanner'
import DateInput from '../components/DateInput'
import RichTextNotes from '../components/RichTextNotes'

// ASSUMPTION: default payment terms not found elsewhere in this file or in
// stored project notes — defaulting to Net 30. Adjust DEFAULT_TERMS_DAYS if
// Klair's actual standard terms differ.
const DEFAULT_TERMS_DAYS = 30

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function InvoiceForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isNew = !id
  const { activeOrg, isSuspended } = useOrg()
  
  const DRAFT_KEY = 'invoice_draft'
  const [customers, setCustomers] = useState([])
  const [products, setProducts]   = useState([])
  const [saving, setSaving]       = useState(false)
  const [invoice, setInvoice]     = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    return {
      customer_id: '',
      number: '',
      date: today,
      due_date: addDays(today, DEFAULT_TERMS_DAYS),
      status: 'draft',
      notes: '',
    }
  })
  const [items, setItems] = useState([{ product_id: '', name: '', quantity: 1, unit_price: 0 }])

  // Load customers + products scoped to org
  useEffect(() => {
    if (!activeOrg?.orgId) return
    supabase.from('customers')
      .select('id, name')
      .eq('org_id', activeOrg.orgId)
      .order('name')
      .then(({ data }) => setCustomers(data || []))

    supabase.from('products')
      .select('id, name, description, unit_price')
      .eq('org_id', activeOrg.orgId)
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [activeOrg?.orgId])

  // Save whenever form state changes
 // Restore draft on mount (new invoices only)
useEffect(() => {
  if (!isNew) return
  const saved = localStorage.getItem(DRAFT_KEY)
  if (!saved) return
  try {
    const d = JSON.parse(saved)
    if (d.invoice) setInvoice(prev => ({ ...prev, ...d.invoice }))
    if (d.items?.length) setItems(d.items)
  } catch {}
}, []) // runs once on mount

  useEffect(() => {
  if (!isNew) return
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ invoice, items }))
}, [invoice, items])

  // Auto-generate invoice number scoped to org
  useEffect(() => {
    if (!id && activeOrg?.orgId) suggestInvoiceNumber()
  }, [id, activeOrg?.orgId])

  async function suggestInvoiceNumber() {
    const { data } = await supabase
      .from('invoices')
      .select('number')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (data?.length && data[0].number) {
      const lastNum = parseInt(data[0].number.replace(/\D/g, '')) || 0
      setInvoice(prev => ({ ...prev, number: `INV-${String(lastNum + 1).padStart(3, '0')}` }))
    } else {
      setInvoice(prev => ({ ...prev, number: 'INV-001' }))
    }
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

function handleProductSelect(idx, productId) {
  const product = products.find(p => p.id === productId)
  setItems(prev => prev.map((it, i) => {   // in InvoiceView.jsx this is setEditItems
    if (i !== idx) return it
    return {
      ...it,
      product_id: productId,
      name:       product?.description?.trim() || product?.name || '',
      unit_price: product?.unit_price || 0,
    }
  }))
}

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function addItem() {
    setItems(prev => [...prev, { product_id: '', name: '', quantity: 1, unit_price: 0 }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!invoice.customer_id) return alert('Select a customer')
    if (!activeOrg?.orgId)    return alert('No active organization')

    const { allowed, reason } = await checkCanCreateInvoice(activeOrg.orgId)
    if (!allowed) {
      alert(reason)
      return
    }

    setSaving(true)

    try {
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert([{
          ...invoice,
          org_id:   activeOrg.orgId,
          due_date: invoice.due_date || null,
          subtotal, tax, total,
        }])
        .select()
        .single()
      if (invErr) throw invErr

      const validItems = items.filter(i => i.name?.trim() && Number(i.quantity) > 0)
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase
          .from('invoice_items')
          .insert(validItems.map(i => ({
            invoice_id: inv.id,
            org_id:     activeOrg.orgId,
            product_id: i.product_id || null,
            name:       i.name.trim(),
            quantity:   Number(i.quantity),
            unit_price: Number(i.unit_price) || 0,
          })))
        if (itemErr) throw itemErr
      }
      localStorage.removeItem(DRAFT_KEY)    
      navigate(`/invoices/${inv.id}`)
    } catch (err) {
      alert('Error saving invoice: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5 p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold">New Invoice</h1>
          {activeOrg && <p className="text-sm text-gray-400 mt-1">{activeOrg.name}</p>}
        </div>
        <button type="button" onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
      </div>

      <SuspendedBanner />

      <fieldset disabled={isSuspended} style={{ border: 'none', padding: 0, margin: 0 }}>

      {/* Invoice meta */}
      <div className="bg-white p-6 rounded-2xl border grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer *</label>
          <select required className="w-full p-2 border rounded-lg text-sm" value={invoice.customer_id}
            onChange={e => setInvoice({ ...invoice, customer_id: e.target.value })}>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice #</label>
          <input type="text" value={invoice.number}
            onChange={e => setInvoice({ ...invoice, number: e.target.value })}
            className="text-2xl font-bold border-b-2 border-transparent hover:border-gray-200 focus:border-teal-500 outline-none bg-transparent w-full" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Issue Date *</label>
          <DateInput required value={invoice.date} onChange={v => setInvoice({ ...invoice, date: v })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
          <DateInput value={invoice.due_date} onChange={v => setInvoice({ ...invoice, due_date: v })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select className="w-full p-2 border rounded-lg text-sm" value={invoice.status}
            onChange={e => setInvoice({ ...invoice, status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white p-6 rounded-2xl border">
  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Line Items</h3>

  {/* Column headers */}
  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 28px', gap: 8, marginBottom: 6, padding: '0 4px' }}>
    <span className="text-xs text-gray-400">Product</span>
    <span className="text-xs text-gray-400">Description</span>
    <span className="text-xs text-gray-400 text-right">Qty</span>
    <span className="text-xs text-gray-400 text-right">Unit Price</span>
    <span />
  </div>

  {items.map((item, idx) => (
    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
      <select
        className="p-2 border rounded-lg text-sm bg-white"
        value={item.product_id || ''}
        onChange={e => handleProductSelect(idx, e.target.value)}
      >
        <option value="">Select…</option>
        {products.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <textarea
        placeholder="Description / detail"
        className="p-2 border rounded-lg text-sm w-full resize-none"
        rows={2}
        value={item.name}
        onChange={e => updateItem(idx, 'name', e.target.value)}
      />

      <input
        type="number" min="0" step="any" placeholder="1"
        className="p-2 border rounded-lg text-sm text-right w-full"
        value={item.quantity}
        onChange={e => updateItem(idx, 'quantity', e.target.value)}
      />

      <input
        type="number" min="0" step="any" placeholder="0.00"
        className="p-2 border rounded-lg text-sm text-right w-full"
        value={item.unit_price}
        onChange={e => updateItem(idx, 'unit_price', e.target.value)}
      />

      <button
        type="button"
        onClick={() => removeItem(idx)}
        className="text-gray-300 hover:text-red-500 text-xl font-light"
      >×</button>
    </div>
  ))}

  <button type="button" onClick={addItem}
    className="mt-2 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
    + Add Line Item
  </button>

  {/* Totals */}
  <div className="mt-5 pt-4 border-t flex flex-col items-end gap-1.5">
    <div className="flex gap-10 text-sm">
      <span className="text-gray-400">Subtotal</span>
      <span className="text-gray-700 w-24 text-right">${subtotal.toFixed(2)}</span>
    </div>
    <div className="flex gap-10 text-sm">
      <span className="text-gray-400">Tax (5%)</span>
      <span className="text-gray-700 w-24 text-right">${tax.toFixed(2)}</span>
    </div>
    <div className="w-36 h-px bg-gray-200 my-1" />
    <div className="flex gap-10">
      <span className="text-sm font-semibold text-gray-700">Total</span>
      <span className="text-xl font-bold text-gray-900 w-24 text-right">${total.toFixed(2)}</span>
    </div>
  </div>
</div>

      {/* Notes */}
      <div className="bg-white p-6 rounded-2xl border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
        <RichTextNotes
          value={invoice.notes}
          onChange={html => setInvoice({ ...invoice, notes: html })}
          placeholder="Payment terms, bank details, thank you note..."
        />
      </div>

      <button type="submit" disabled={saving}
        className="w-full bg-teal-700 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : 'Create Invoice'}
      </button>

      </fieldset>
    </form>
  )
}
