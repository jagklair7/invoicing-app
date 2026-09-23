// src/pages/RecurringInvoices.jsx
//
// New page. Wire into your router (e.g. src/App.jsx or wherever
// Invoices.jsx / Quotes.jsx are routed) at a path like /recurring-invoices,
// and add a nav entry in Layout.jsx alongside Invoices / Purchase Orders.
//
// Corrected against your actual InvoiceForm.jsx:
//   - useOrg() -> { activeOrg }, orgId is activeOrg.orgId
//   - supabase client import path is '../app/supabaseClient'
//   - line items use { product_id, name, quantity, unit_price } to match
//     invoice_items, not the { description, rate } shape I'd guessed earlier
//
// Still-flagged assumption: customers table query below only selects
// { id, name } for the picker (InvoiceForm.jsx also selects
// parent_customer_id, default_notes, but those aren't needed here).

import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]

const emptyLineItem = () => ({ product_id: '', name: '', quantity: 1, unit_price: 0 })

export default function RecurringInvoices() {
  const { activeOrg } = useOrg()
  const orgId = activeOrg?.orgId
  const [templates, setTemplates] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = list view, {} = new, {...} = edit

  useEffect(() => {
    if (!orgId) return
    loadTemplates()
    loadCustomers()
    loadProducts()
  }, [orgId])

  async function loadTemplates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('recurring_invoice_templates')
      .select('*, customers(name)')
      .eq('org_id', orgId)
      .order('next_run_date', { ascending: true })
    if (!error) setTemplates(data || [])
    setLoading(false)
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name')
    setCustomers(data || [])
  }

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, name, description, unit_price')
      .eq('org_id', orgId)
      .order('name')
    setProducts(data || [])
  }

  async function toggleActive(template) {
    await supabase
      .from('recurring_invoice_templates')
      .update({ active: !template.active })
      .eq('id', template.id)
    loadTemplates()
  }

  async function deleteTemplate(id) {
    if (!confirm('Delete this recurring invoice? Already-generated invoices are not affected.')) return
    await supabase.from('recurring_invoice_templates').delete().eq('id', id)
    loadTemplates()
  }

  if (editing !== null) {
    return (
      <RecurringInvoiceForm
        orgId={orgId}
        customers={customers}
        products={products}
        initial={editing}
        onDone={() => {
          setEditing(null)
          loadTemplates()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Recurring Invoices</h1>
        <button
          className="bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-600"
          onClick={() => setEditing({})}
        >
          + New Recurring Invoice
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-gray-400 text-sm">No recurring invoices set up yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Frequency</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Run</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pay Now</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2">{t.customers?.name}</td>
                  <td className="px-4 py-2 capitalize">{t.frequency}</td>
                  <td className="px-4 py-2">{t.next_run_date}</td>
                  <td className="px-4 py-2">{t.online_payment_enabled ? 'Enabled' : '—'}</td>
                  <td className="px-4 py-2">
                    <button
                      className={`text-xs px-2 py-1 rounded-full ${
                        t.active ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
                      }`}
                      onClick={() => toggleActive(t)}
                    >
                      {t.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                    <button className="text-teal-700 hover:underline" onClick={() => setEditing(t)}>
                      Edit
                    </button>
                    <button className="text-red-500 hover:underline" onClick={() => deleteTemplate(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RecurringInvoiceForm({ orgId, customers, products, initial, onDone, onCancel }) {
  const isNew = !initial.id
  const [customerId, setCustomerId] = useState(initial.customer_id || '')
  const [frequency, setFrequency] = useState(initial.frequency || 'monthly')
  const [nextRunDate, setNextRunDate] = useState(initial.next_run_date || todayStr())
  const [endDate, setEndDate] = useState(initial.end_date || '')
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(!!initial.online_payment_enabled)
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState(initial.invoice_number_prefix || '')
  const [notes, setNotes] = useState(initial.notes || '')
  const [lineItems, setLineItems] = useState(initial.line_items?.length ? initial.line_items : [emptyLineItem()])
  const [saving, setSaving] = useState(false)

  function handleProductSelect(idx, productId) {
    const product = products.find((p) => p.id === productId)
    setLineItems((items) =>
      items.map((it, i) =>
        i === idx
          ? {
              ...it,
              product_id: productId,
              name: product?.description?.trim() || product?.name || '',
              unit_price: product?.unit_price || 0,
            }
          : it
      )
    )
  }

  function updateItem(idx, field, value) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  function addItem() {
    setLineItems((items) => [...items, emptyLineItem()])
  }

  function removeItem(idx) {
    setLineItems((items) => items.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    const validItems = lineItems.filter((i) => i.name?.trim() && Number(i.quantity) > 0)

    const payload = {
      org_id: orgId,
      customer_id: customerId,
      frequency,
      next_run_date: nextRunDate,
      end_date: endDate || null,
      online_payment_enabled: onlinePaymentEnabled,
      invoice_number_prefix: invoiceNumberPrefix || null,
      notes,
      line_items: validItems,
      active: initial.active ?? true,
    }

    if (isNew) {
      await supabase.from('recurring_invoice_templates').insert(payload)
    } else {
      await supabase.from('recurring_invoice_templates').update(payload).eq('id', initial.id)
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">{isNew ? 'New Recurring Invoice' : 'Edit Recurring Invoice'}</h1>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer *</label>
          <select
            className="w-full p-2 border rounded-lg text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Invoice Number Prefix (optional)
          </label>
          <input
            type="text"
            className="w-full p-2 border rounded-lg text-sm"
            value={invoiceNumberPrefix}
            onChange={(e) => setInvoiceNumberPrefix(e.target.value)}
            placeholder="Falls back to org default"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Frequency</label>
          <select
            className="w-full p-2 border rounded-lg text-sm"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Next Run Date *</label>
          <input
            type="date"
            className="w-full p-2 border rounded-lg text-sm"
            value={nextRunDate}
            onChange={(e) => setNextRunDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End Date (optional)</label>
          <input
            type="date"
            className="w-full p-2 border rounded-lg text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlinePaymentEnabled}
              onChange={(e) => setOnlinePaymentEnabled(e.target.checked)}
            />
            Show Pay Now button on generated invoices
          </label>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Line Items</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 28px', gap: 8, marginBottom: 6, padding: '0 4px' }}>
          <span className="text-xs text-gray-400">Product</span>
          <span className="text-xs text-gray-400">Description</span>
          <span className="text-xs text-gray-400 text-right">Qty</span>
          <span className="text-xs text-gray-400 text-right">Unit Price</span>
          <span />
        </div>

        {lineItems.map((item, idx) => (
          <div
            key={idx}
            style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}
          >
            <select
              className="p-2 border rounded-lg text-sm bg-white"
              value={item.product_id || ''}
              onChange={(e) => handleProductSelect(idx, e.target.value)}
            >
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Description / detail"
              className="p-2 border rounded-lg text-sm w-full"
              value={item.name}
              onChange={(e) => updateItem(idx, 'name', e.target.value)}
            />

            <input
              type="number"
              min="0"
              step="any"
              placeholder="1"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.quantity}
              onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
            />

            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              className="p-2 border rounded-lg text-sm text-right w-full"
              value={item.unit_price}
              onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
            />

            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-gray-300 hover:text-red-500 text-xl font-light"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="mt-2 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
        >
          + Add Line Item
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes (optional)</label>
        <textarea
          className="w-full p-2 border rounded-lg text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !customerId || lineItems.length === 0}
          className="flex-1 bg-teal-700 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-xl font-semibold border text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
