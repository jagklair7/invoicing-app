// src/pages/InvoiceForm.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

// ── Pre-defined products catalogue ──────────────────────────────────────────
// Edit this list to match your real products/services.
const PRODUCTS = [
  {
    name: 'Monthly Contract',
    defaultDescription: 'Monthly retainer – ',   // user appends month/detail
    unit_price: 1500,
  },
  {
    name: 'One-time Setup',
    defaultDescription: 'Initial setup and onboarding fee',
    unit_price: 500,
  },
  {
    name: 'Consulting Hours',
    defaultDescription: 'Consulting / advisory services',
    unit_price: 150,
  },
  {
    name: 'Support Package',
    defaultDescription: 'Monthly support & maintenance package',
    unit_price: 300,
  },
  {
    name: 'Custom Development',
    defaultDescription: 'Custom development work – ',
    unit_price: 0,
  },
  {
    name: 'License Fee',
    defaultDescription: 'Software license fee',
    unit_price: 0,
  },
  {
    name: 'Other',
    defaultDescription: '',
    unit_price: 0,
  },
]

const EMPTY_ITEM = { product: '', name: '', quantity: 1, unit_price: 0 }

export default function InvoiceForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { activeOrg } = useOrg()

  const [customers, setCustomers] = useState([])
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState({
    customer_id: '',
    number: '',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  // Load customers scoped to org
  useEffect(() => {
    if (!activeOrg?.orgId) return
    supabase.from('customers')
      .select('id, name')
      .eq('org_id', activeOrg.orgId)
      .order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [activeOrg?.orgId])

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

  // When a product is chosen from the dropdown, auto-fill description & price
  // but keep them fully editable afterward.
  function handleProductSelect(idx, productName) {
    const product = PRODUCTS.find(p => p.name === productName)
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      return {
        ...it,
        product:    productName,
        name:       product ? product.defaultDescription : '',
        unit_price: product ? product.unit_price : 0,
      }
    }))
  }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!invoice.customer_id) return alert('Select a customer')
    if (!activeOrg?.orgId) return alert('No active organization')
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
            product:    i.product || null,   // NEW: store chosen product label
            name:       i.name.trim(),
            quantity:   Number(i.quantity),
            unit_price: Number(i.unit_price) || 0,
          })))
        if (itemErr) throw itemErr
      }

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
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
      </div>

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
          <input required type="date" className="w-full p-2 border rounded-lg text-sm" value={invoice.date}
            onChange={e => setInvoice({ ...invoice, date: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
          <input type="date" className="w-full p-2 border rounded-lg text-sm" value={invoice.due_date}
            onChange={e => setInvoice({ ...invoice, due_date: e.target.value })} />
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
        <div className="grid grid-cols-[160px_1fr_80px_110px_36px] gap-2 mb-1 px-1">
          <span className="text-xs text-gray-400">Product / Item</span>
          <span className="text-xs text-gray-400">Description</span>
          <span className="text-xs text-gray-400 text-right">Qty</span>
          <span className="text-xs text-gray-400 text-right">Unit Price</span>
          <span />
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[160px_1fr_80px_110px_36px] gap-2 mb-3 items-start">

            {/* ── Product dropdown ── */}
            <select
              className="p-2 border rounded-lg text-sm w-full bg-white"
              value={item.product}
              onChange={e => handleProductSelect(idx, e.target.value)}
            >
              <option value="">Select product…</option>
              {PRODUCTS.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>

            {/* ── Editable description ── */}
            <input
              placeholder="Description / detail"
              className="p-2 border rounded-lg text-sm w-full"
              value={item.name}
              onChange={e => updateItem(idx, 'name', e.target.value)}
            />

            {/* ── Qty ── */}
            <input
              type="number" min="0" step="any" placeholder="1"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.quantity}
              onChange={e => updateItem(idx, 'quantity', e.target.value)}
            />

            {/* ── Unit price ── */}
            <input
              type="number" min="0" step="any" placeholder="0.00"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.unit_price}
              onChange={e => updateItem(idx, 'unit_price', e.target.value)}
            />

            {/* ── Remove ── */}
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-gray-300 hover:text-red-500 text-xl font-light mt-1"
            >×</button>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="mt-1 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
        >
          + Add Line Item
        </button>

        {/* Totals */}
        <div className="mt-5 pt-4 border-t flex flex-col items-end gap-1.5">
          <div className="flex gap-10 text-sm"><span className="text-gray-400">Subtotal</span><span className="text-gray-700 w-24 text-right">${subtotal.toFixed(2)}</span></div>
          <div className="flex gap-10 text-sm"><span className="text-gray-400">Tax (5%)</span><span className="text-gray-700 w-24 text-right">${tax.toFixed(2)}</span></div>
          <div className="w-36 h-px bg-gray-200 my-1" />
          <div className="flex gap-10"><span className="text-sm font-semibold text-gray-700">Total</span><span className="text-xl font-bold text-gray-900 w-24 text-right">${total.toFixed(2)}</span></div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white p-6 rounded-2xl border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
        <textarea
          className="w-full p-3 border rounded-lg text-sm resize-vertical"
          rows={4}
          placeholder="Payment terms, bank details, thank you note..."
          value={invoice.notes}
          onChange={e => setInvoice({ ...invoice, notes: e.target.value })}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-teal-700 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Create Invoice'}
      </button>
    </form>
  )
}
