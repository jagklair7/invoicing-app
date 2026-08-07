// src/pages/Customers.jsx
import { supabase } from '../app/supabaseClient'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'

export default function Customers() {
  const { activeOrg } = useOrg()
  const [customers, setCustomers] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '',
    city: '', province: 'AB', postal_code: '', country: 'Canada'
  })
  const navigate = useNavigate()

  const PROVINCES = [
    { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
    { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
    { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
    { code: 'YT', name: 'Yukon' }
  ]

  useEffect(() => {
    if (activeOrg?.orgId) fetchCustomers()
  }, [activeOrg?.orgId])

  async function fetchCustomers() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })
    setCustomers(data || [])
  }

  async function deleteCustomer(id) {
    if (!window.confirm('Are you sure you want to delete this customer?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) alert('Error deleting: ' + error.message)
    else fetchCustomers()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.name.trim() || !activeOrg?.orgId) return

    const payload = { ...formData, org_id: activeOrg.orgId }

    if (editingId) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editingId)
      if (error) { alert(error.message); return }
    } else {
      const { error } = await supabase.from('customers').insert([payload])
      if (error) { alert(error.message); return }
    }

    setEditingId(null)
    setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', city: '', province: 'AB', postal_code: '', country: 'Canada' })
    fetchCustomers()
  }

  const startEdit = (c) => {
    setEditingId(c.id)
    setFormData({
      name: c.name, contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '',
      address: c.address || '', city: c.city || '',
      province: c.province || 'AB', postal_code: c.postal_code || '', country: c.country || 'Canada'
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData({ name: '', contact_person: '', email: '', phone: '', address: '', city: '', province: 'AB', postal_code: '', country: 'Canada' })
  }

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">{editingId ? 'Edit Customer' : 'Customers'}</h1>
          {activeOrg && <p className="text-sm text-gray-400 mt-1">{activeOrg.name}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Company Name *</label>
            <input name="name" required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.name} onChange={handleChange} placeholder="e.g. Digital Corp" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Contact Person</label>
            <input name="contact_person" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.contact_person} onChange={handleChange} placeholder="e.g. Jane Smith" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Email Address</label>
            <input name="email" type="email" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.email} onChange={handleChange} placeholder="billing@digitalcorp.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Phone Number</label>
            <input name="phone" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Street Address</label>
            <input name="address" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.address} onChange={handleChange} placeholder="123 Business Way" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">City</label>
            <input name="city" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.city} onChange={handleChange} placeholder="City" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Province</label>
            <select name="province" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.province} onChange={handleChange}>
              {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Postal Code</label>
            <input name="postal_code" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.postal_code} onChange={handleChange} placeholder="A1A 1A1" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Country</label>
            <input name="country" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" value={formData.country} onChange={handleChange} placeholder="Canada" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" className="bg-teal-700 text-white px-8 py-3 rounded-lg font-bold hover:bg-teal-600 transition-all">
            {editingId ? 'Update Customer' : 'Add Customer'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="bg-gray-100 text-gray-600 px-8 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase text-gray-500">Customer</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-gray-500">Contact Person</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-gray-500">Email</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-gray-500">Phone</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-right text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No customers yet for {activeOrg?.name}.</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-semibold text-gray-900">{c.name}</td>
                <td className="px-6 py-4 text-gray-500 text-sm">{c.contact_person || '—'}</td>
                <td className="px-6 py-4 text-gray-500 text-sm">{c.email || '—'}</td>
                <td className="px-6 py-4 text-gray-500 text-sm">{c.phone || '—'}</td>
                <td className="px-6 py-4 text-right space-x-4">
                  <button onClick={() => startEdit(c)} className="text-blue-600 hover:underline font-medium text-sm">Edit</button>
                  <button onClick={() => deleteCustomer(c.id)} className="text-red-500 hover:underline font-medium text-sm">Delete</button>
                  <button onClick={() => navigate(`/customers/${c.id}/statement`)} className="text-teal-600 hover:underline font-medium text-sm">Statement</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
