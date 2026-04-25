// src/pages/InvoiceForm.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../app/supabaseClient'

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams()
  const [customers, setCustomers] = useState([])
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState({
    customer_id: '',
    number: `INV-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    status: 'draft',
  })
  const [items, setItems] = useState([{ name: '', quantity: 1, unit_price: 0 }])

  useEffect(() => {
    supabase.from('customers').select('id, name').order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  const handleInvoiceChange = (e) => {
    const { name, value } = e.target
    setInvoice(prev => ({
      ...prev,
      [name]: value
    }))
  }
  // Live totals
  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function addItem() {
    setItems(prev => [...prev, { name: '', quantity: 1, unit_price: 0 }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!invoice.customer_id) return alert('Select a customer')
    setSaving(true)

    try {
      // 1. Insert invoice with computed totals
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert([{
          ...invoice,
          due_date: invoice.due_date || null,
          subtotal,
          tax,
          total,
        }])
        .select()
        .single()

      if (invErr) throw invErr

      // 2. Insert valid line items
      const validItems = items.filter(i => i.name?.trim() && Number(i.quantity) > 0)
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase
          .from('invoice_items')
          .insert(validItems.map(i => ({
            invoice_id: inv.id,
            name: i.name.trim(),
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price) || 0,
          })))
        if (itemErr) throw itemErr
      }

      navigate(`/invoices/${inv.id}`)
    } catch (err) {
      console.error(err)
      alert('Error saving invoice: ' + err.message)
    } finally {
      setSaving(false)
    }
  }
    useEffect(() => {
      async function suggestInvoiceNumber() {
        // Check if 'id' exists. If you are using React Router, 'id' comes from useParams()
        // If 'id' is undefined, it means we are on the "New Invoice" page.
        if (!id) { 
          const { data, error } = await supabase
            .from('invoices')
            .select('number')
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            console.error("Error fetching last invoice:", error);
            return;
          }

          if (data && data.length > 0 && data[0].number) {
            // Strip non-numeric characters to find the number part
            const lastNum = parseInt(data[0].number.replace(/\D/g, '')) || 0;
            const nextNum = lastNum + 1;
            
            setInvoice(prev => ({ 
              ...prev, 
              number: `INV-${String(nextNum).padStart(3, '0')}` 
            }));
          } else {
            // If no invoices exist in the DB yet, start at 001
            setInvoice(prev => ({ ...prev, number: 'INV-001' }));
          }
        }
      }
      suggestInvoiceNumber();
    }, [id]); // Only runs when the component mounts or id changes

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5 p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">New Invoice</h1>
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </button>
      </div>

      {/* Invoice details */}
      <div className="bg-white p-6 rounded-2xl border grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer *</label>
          <select
            required
            className="w-full p-2 border rounded-lg text-sm"
            value={invoice.customer_id}
            onChange={e => setInvoice({ ...invoice, customer_id: e.target.value })}
          >
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice #</label>
          <input
            type="text"
            name="number"
            value={invoice.number}
            onChange={handleInvoiceChange}
            placeholder="INV-000"
            className="text-2xl font-bold border-b-2 border-transparent hover:border-gray-200 focus:border-black outline-none transition-all bg-transparent w-full md:w-1/2"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Issue Date *</label>
          <input
            required
            type="date"
            className="w-full p-2 border rounded-lg text-sm"
            value={invoice.date}
            onChange={e => setInvoice({ ...invoice, date: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
          <input
            type="date"
            className="w-full p-2 border rounded-lg text-sm"
            value={invoice.due_date}
            onChange={e => setInvoice({ ...invoice, due_date: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select
            className="w-full p-2 border rounded-lg text-sm"
            value={invoice.status}
            onChange={e => setInvoice({ ...invoice, status: e.target.value })}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white p-6 rounded-2xl border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Line Items</h3>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_110px_36px] gap-2 mb-1 px-1">
          <span className="text-xs text-gray-400">Description</span>
          <span className="text-xs text-gray-400 text-right">Qty</span>
          <span className="text-xs text-gray-400 text-right">Unit Price</span>
          <span></span>
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_80px_110px_36px] gap-2 mb-2 items-center">
            <input
              placeholder="Item description"
              className="p-2 border rounded-lg text-sm w-full"
              value={item.name}
              onChange={e => updateItem(idx, 'name', e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="any"
              placeholder="1"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.quantity}
              onChange={e => updateItem(idx, 'quantity', e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.unit_price}
              onChange={e => updateItem(idx, 'unit_price', e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-gray-300 hover:text-red-500 text-xl font-light leading-none"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="mt-3 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
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

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Create Invoice'}
      </button>
    </form>
  )
}
