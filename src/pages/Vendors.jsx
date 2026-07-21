// src/pages/Vendors.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const PROVINCES = [
  'AB','BC','MB','NB','NL','NS','ON','PE','QC','SK','NT','NU','YT'
]

const DEFAULT_FORM = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  province: 'AB',
  postal_code: '',
  notes: '',
}

export default function Vendors() {
  const { activeOrg } = useOrg()
  const [vendors, setVendors] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(DEFAULT_FORM)

  useEffect(() => {
    if (activeOrg?.orgId) fetchVendors()
  }, [activeOrg?.orgId])

  async function fetchVendors() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('name')
    setVendors(data || [])
  }

  async function deleteVendor(id) {
    if (!window.confirm('Delete this vendor? Purchase orders referencing it will keep their vendor name on file but lose the link.')) return
    const { error } = await supabase.from('vendors').delete().eq('id', id).eq('org_id', activeOrg.orgId)
    if (error) {
      alert('Error deleting vendor: ' + error.message)
      return
    }
    fetchVendors()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!activeOrg?.orgId) return

    if (!formData.name.trim()) {
      setError('Vendor name is required.')
      return
    }

    setSaving(true)

    const payload = {
      org_id: activeOrg.orgId,
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      province: formData.province,
      postal_code: formData.postal_code.trim() || null,
      notes: formData.notes.trim() || null,
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editingId).eq('org_id', activeOrg.orgId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vendors').insert([payload])
        if (error) throw error
      }

      setEditingId(null)
      setFormData(DEFAULT_FORM)
      fetchVendors()
    } catch (err) {
      setError(err.message || 'Unable to save vendor.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (vendor) => {
    setEditingId(vendor.id)
    setFormData({
      name: vendor.name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      city: vendor.city || '',
      province: vendor.province || 'AB',
      postal_code: vendor.postal_code || '',
      notes: vendor.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData(DEFAULT_FORM)
    setError('')
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          {activeOrg && <p className="text-sm text-gray-400 mt-1">{activeOrg.name}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Vendor Name *</label>
            <input name="name" required value={formData.name} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="e.g. Acme Supply Co." />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Email</label>
            <input name="email" type="email" value={formData.email} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="orders@vendor.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Phone</label>
            <input name="phone" value={formData.phone} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Address</label>
            <input name="address" value={formData.address} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="Street address" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">City</label>
            <input name="city" value={formData.city} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="Edmonton" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Province</label>
              <select name="province" value={formData.province} onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
                {PROVINCES.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Postal Code</label>
              <input name="postal_code" value={formData.postal_code} onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="T5K 2L5" />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none resize-y"
              placeholder="Account number, payment terms, contact person..." />
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-600 transition disabled:opacity-50">
            {saving ? 'Saving…' : editingId ? 'Update vendor' : 'Add vendor'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Vendor</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Contact</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Location</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-right text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No vendors yet. Add your first vendor above.</td>
              </tr>
            ) : vendors.map(vendor => (
              <tr key={vendor.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900">{vendor.name}</div>
                  {vendor.notes && <div className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{vendor.notes}</div>}
                </td>
                <td className="px-6 py-4 text-slate-700">
                  <div>{vendor.email || '—'}</div>
                  {vendor.phone && <div className="text-xs text-slate-500">{vendor.phone}</div>}
                </td>
                <td className="px-6 py-4 text-slate-700">
                  {[vendor.city, vendor.province].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-6 py-4 text-right space-x-4">
                  <button onClick={() => startEdit(vendor)} className="text-teal-600 hover:underline text-sm font-semibold">Edit</button>
                  <button onClick={() => deleteVendor(vendor.id)} className="text-red-500 hover:underline text-sm font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
