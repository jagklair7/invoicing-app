// src/components/BatchExportModal.jsx
//
// For a management company, lists all its properties' outstanding invoices
// and exports the selected ones as one combined PDF the user can attach to
// an email manually. No sending integration — just a single downloadable file.

import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { exportBatchInvoicesPDF } from '../utils/exportInvoicePDF'

export default function BatchExportModal({ managementCompany, onClose }) {
  const { activeOrg } = useOrg()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [properties, setProperties] = useState([])
  const [invoices, setInvoices] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!activeOrg?.orgId || !managementCompany?.id) return
      setLoading(true)

      const { data: props } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', activeOrg.orgId)
        .eq('parent_customer_id', managementCompany.id)
        .order('name')

      if (cancelled) return
      setProperties(props || [])

      const propertyIds = (props || []).map(p => p.id)
      if (propertyIds.length === 0) {
        setInvoices([])
        setSelectedIds(new Set())
        setLoading(false)
        return
      }

      const { data: invs } = await supabase
        .from('invoices')
        .select('*')
        .eq('org_id', activeOrg.orgId)
        .in('customer_id', propertyIds)
        .in('status', ['draft', 'sent'])
        .order('date', { ascending: false })

      if (cancelled) return
      setInvoices(invs || [])
      setSelectedIds(new Set((invs || []).map(i => i.id)))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [activeOrg?.orgId, managementCompany?.id])

  function toggle(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === invoices.length ? new Set() : new Set(invoices.map(i => i.id))
    )
  }

  const getPropertyName = (customerId) =>
    properties.find(p => p.id === customerId)?.name || '—'

  async function handleExport() {
    const selected = invoices.filter(i => selectedIds.has(i.id))
    if (selected.length === 0) return

    setExporting(true)
    try {
      const entries = selected.map(invoice => ({
        invoice,
        customer: properties.find(p => p.id === invoice.customer_id),
      }))
      await exportBatchInvoicesPDF(entries, activeOrg.orgId, managementCompany.name)
      onClose()
    } catch (err) {
      alert('Error exporting invoices: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Export Invoices</h2>
            <p className="text-sm text-gray-400">{managementCompany.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-gray-400">Loading invoices…</p>
          ) : properties.length === 0 ? (
            <p className="text-sm text-gray-400">No properties are linked to {managementCompany.name} yet.</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-400">No outstanding invoices for {managementCompany.name}'s properties.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedIds.size === invoices.length}
                  onChange={toggleAll}
                />
                Select all ({invoices.length})
              </label>
              <div className="space-y-2">
                {invoices.map(inv => (
                  <label key={inv.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                      />
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{getPropertyName(inv.customer_id)}</div>
                        <div className="text-xs text-gray-400">Invoice {inv.number} · {inv.status}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700">
                      {inv.total != null ? `$${Number(inv.total).toFixed(2)}` : '—'}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedIds.size === 0}
            className="bg-teal-700 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-teal-600 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : `Export PDF (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
