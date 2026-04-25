// src/pages/Invoices.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    fetchInvoices()
  }, [location.key])

  async function fetchInvoices() {
    const { data, error } = await supabase
      .from('invoices')
      // ↓ THIS is the fix — join customers so inv.customers.name is available
      .select('*, customers(id, name)')
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    setInvoices(data || [])
  }

  const filtered = invoices.filter(inv =>
    filter === 'all' ? true : inv.status === filter
  )

  function statusColor(status) {
    switch (status) {
      case 'paid':  return 'bg-green-100 text-green-700'
      case 'sent':  return 'bg-blue-100 text-blue-700'
      case 'void':  return 'bg-red-100 text-red-700'
      default:      return 'bg-gray-100 text-gray-600'
    }
  }

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-gray-500">Manage all your invoices</p>
        </div>
        <button
          onClick={() => navigate('/invoices/new')}
          className="bg-black text-white px-4 py-2 rounded-xl"
        >
          + New Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['all', 'draft', 'sent', 'paid', 'void'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border capitalize ${
              filter === f ? 'bg-black text-white border-black' : 'bg-white border-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3 font-medium">Invoice</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Due</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr
                key={inv.id}
                className="border-t hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/invoices/${inv.id}`)}
              >
                <td className="p-3 font-medium text-gray-900">{inv.number}</td>

                {/* ↓ Fixed: was inv.customers?.name but select('*') never loaded customers */}
                <td className="p-3 text-gray-700">{inv.customers?.name || '—'}</td>

                <td className="p-3 text-gray-500">{fmtDate(inv.date)}</td>
                <td className="p-3 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(inv.status)}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="p-3 text-right font-medium text-gray-900">
                  ${Number(inv.total || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            No {filter === 'all' ? '' : filter + ' '}invoices found.
          </div>
        )}
      </div>
    </div>
  )
}
