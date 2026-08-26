// src/components/VendorInvoicesSection.jsx
//
// Tracks invoices vendors send directly (no PO) — invoice #, date,
// amount, payment method, amount paid, and the date paid. Lives as an
// expandable section under each vendor row in Vendors.jsx.
// Supports editing an existing entry (editingId pattern mirrors
// Vendors.jsx's own add/edit form).
//
// Props:
//   vendorId — vendor UUID
//   orgId    — active org ID

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../app/supabaseClient'

const PAYMENT_METHODS = ['Cash', 'Cheque', 'EFT', 'Credit Card']

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const DEFAULT_FORM = {
  invoice_number: '',
  invoice_date: new Date().toISOString().split('T')[0],
  amount: '',
  amount_paid: '',
  payment_method: 'EFT',
  paid_date: '',
  notes: '',
}

export default function VendorInvoicesSection({ vendorId, orgId }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(DEFAULT_FORM)

  const fetchInvoices = useCallback(async () => {
    if (!vendorId || !orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('vendor_invoices')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('org_id', orgId)
      .order('invoice_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }, [vendorId, orgId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function startEdit(inv) {
    setEditingId(inv.id)
    setForm({
      invoice_number: inv.invoice_number || '',
      invoice_date: inv.invoice_date || new Date().toISOString().split('T')[0],
      amount: inv.amount ?? '',
      amount_paid: inv.amount_paid ?? '',
      payment_method: inv.payment_method || 'EFT',
      paid_date: inv.paid_date || '',
      notes: inv.notes || '',
    })
    setError('')
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setError('')
  }

  async function saveInvoice(e) {
    e.preventDefault()
    setError('')

    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) {
      setError('Amount is required.')
      return
    }
    const amountPaid = form.amount_paid ? parseFloat(form.amount_paid) : 0

    const payload = {
      org_id: orgId,
      vendor_id: vendorId,
      invoice_number: form.invoice_number.trim() || null,
      invoice_date: form.invoice_date,
      amount,
      amount_paid: amountPaid,
      payment_method: form.payment_method,
      paid_date: form.paid_date || null,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (editingId) {
        const { error: updErr } = await supabase
          .from('vendor_invoices')
          .update(payload)
          .eq('id', editingId)
          .eq('org_id', orgId)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('vendor_invoices')
          .insert(payload)
        if (insErr) throw insErr
      }

      cancelForm()
      fetchInvoices()
    } catch (err) {
      setError(err.message || 'Unable to save invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteInvoice(inv) {
    if (!window.confirm(`Remove invoice ${inv.invoice_number || '(no number)'} for ${fmt(inv.amount)}? This can't be undone.`)) return
    setDeletingId(inv.id)
    try {
      const { error: delErr } = await supabase
        .from('vendor_invoices')
        .delete()
        .eq('id', inv.id)
        .eq('org_id', orgId)
      if (delErr) throw delErr
      setInvoices(prev => prev.filter(i => i.id !== inv.id))
      if (editingId === inv.id) cancelForm()
    } catch (err) {
      alert('Failed to remove invoice: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount || 0), 0)
  const totalPaid   = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0)
  const totalOwing  = totalAmount - totalPaid

  return (
    <div className="bg-slate-50 border-t border-gray-200 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Vendor Invoices</span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-dashed border-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
          >
            + Add Invoice
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-4">Loading…</div>
      ) : invoices.length === 0 && !showForm ? (
        <div className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-xl py-6 text-center">
          No invoices recorded for this vendor yet.
        </div>
      ) : invoices.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-white border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">Invoice #</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">Date</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">Method</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">Paid On</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 text-right">Amount</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 text-right">Paid</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 text-right">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => {
                const balance = Number(inv.amount || 0) - Number(inv.amount_paid || 0)
                return (
                  <tr key={inv.id} className={`hover:bg-slate-50 ${editingId === inv.id ? 'bg-teal-50/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(inv.paid_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmt(inv.amount_paid)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {balance > 0 ? fmt(balance) : '✓ Paid'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                      <button
                        onClick={() => startEdit(inv)}
                        className="text-teal-600 hover:underline text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteInvoice(inv)}
                        disabled={deletingId === inv.id}
                        className="text-red-500 hover:underline text-xs font-semibold disabled:opacity-50"
                      >
                        {deletingId === inv.id ? '…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex justify-end gap-8 px-4 py-3 bg-slate-50 border-t border-gray-100 text-sm">
            <div className="text-right">
              <div className="text-xs text-gray-400">Total Invoiced</div>
              <div className="font-semibold text-slate-800">{fmt(totalAmount)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Total Paid</div>
              <div className="font-semibold text-emerald-600">{fmt(totalPaid)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Balance Owing</div>
              <div className={`font-semibold ${totalOwing > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(totalOwing)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={saveInvoice} className="bg-white border border-teal-200 rounded-xl p-4 grid gap-3">
          {editingId && (
            <div className="text-xs font-semibold text-teal-700 -mb-1">Editing invoice</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Invoice #</label>
              <input
                name="invoice_number"
                value={form.invoice_number}
                onChange={handleChange}
                placeholder="e.g. INV-4821"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Invoice Date</label>
              <input
                name="invoice_date"
                type="date"
                value={form.invoice_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Amount *</label>
              <input
                name="amount"
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Amount Paid</label>
              <input
                name="amount_paid"
                type="number" min="0" step="0.01"
                value={form.amount_paid}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Payment Method</label>
              <select
                name="payment_method"
                value={form.payment_method}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Paid On</label>
              <input
                name="paid_date"
                type="date"
                value={form.paid_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
              <input
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-xs">{error}</div>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Update Invoice' : 'Save Invoice'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
