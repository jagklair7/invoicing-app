import { supabase } from '../app/supabaseClient'
import { useEffect, useState, } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [editingId, setEditingId] = useState(null) // Track who we are editing
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '', // Street address
    city: '',
    province: 'AB',
    postal_code: '',
    country: 'Canada'
  })
  const navigate = useNavigate()
  // Canadian Provinces mapping
  const PROVINCES = [
    { code: 'AB', name: 'Alberta' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'ON', name: 'Ontario' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'NU', name: 'Nunavut' },
    { code: 'YT', name: 'Yukon' }
  ]
  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
    setCustomers(data || [])
  }

  // This handles Deleting the Customer
  async function deleteCustomer(id) {
  if (!window.confirm("Are you sure you want to delete this customer? This will also delete their invoices if they have any.")) return;

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);

  if (error) {
    alert("Error deleting: " + error.message);
  } else {
    fetchCustomers(); // Refresh the list
  }
}

  // This handles BOTH Save (Insert) and Update
  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.name.trim()) return

    if (editingId) {
      // UPDATE EXISTING
      const { error } = await supabase
        .from('customers')
        .update(formData)
        .eq('id', editingId)
      
      if (!error) {
        setEditingId(null)
        setFormData({ name: '', email: '', phone: '', address: '', city: '', province: 'AB', postal_code: '', country: 'Canada' })
        fetchCustomers()
      } else {
        alert(error.message)
      }
    } else {
      // INSERT NEW
      const { error } = await supabase.from('customers').insert([formData])
      if (!error) {
        setFormData({ name: '', email: '', phone: '', address: '', city: '', province: 'AB', postal_code: '', country: 'Canada' })
        fetchCustomers()
      }
    }
  }
  const startEdit = (customer) => {
    setEditingId(customer.id)
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      province: customer.province || 'AB',
      postal_code: customer.postal_code || '',
      country: customer.country || 'Canada'
    })
    window.scrollTo({ top: 0, behavior: 'smooth' }) // UI Polish: scroll back to form
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData({ name: '', email: '', phone: '', address: '', city: '', province: 'AB', postal_code: '', country: 'Canada' })
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-8">
        {editingId ? 'Edit Customer' : 'Add New Customer'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* NAME FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Company Name *</label>
            <input
              name="name"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Digital Corp"
            />
          </div>

          {/* EMAIL FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Email Address</label>
            <input
              name="email"
              type="email"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.email}
              onChange={handleChange}
              placeholder="billing@digitalcorp.com"
            />
          </div>

          {/* PHONE FIELD (The missing piece #1) */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Phone Number</label>
            <input
              name="phone"
              type="text"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          {/* ADDRESS FIELD (The missing piece #2) */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Street Address</label>
            <input
              name="address"
              type="text"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.address}
              onChange={handleChange}
              placeholder="123 Business Way"
            />
          </div>

          {/* CITY FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">City</label>
            <input
              name="city"
              type="text"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.city}
              onChange={handleChange}
              placeholder="City"
            />
          </div>

          {/* PROVINCE FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Province</label>
            <select
              name="province"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.province}
              onChange={handleChange}
            >
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* POSTAL CODE FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Postal Code</label>
            <input
              name="postal_code"
              type="text"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.postal_code}
              onChange={handleChange}
              placeholder="A1A 1A1"
            />
          </div>

          {/* COUNTRY FIELD */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Country</label>
            <input
              name="country"
              type="text"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition-all"
              value={formData.country}
              onChange={handleChange}
              placeholder="Canada"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            type="submit" 
            className="bg-black text-white px-8 py-3 rounded-lg font-bold hover:bg-gray-800 transform active:scale-95 transition-all"
          >
            {editingId ? 'Update Customer' : 'Add Customer'}
          </button>
          
          {editingId && (
            <button 
              type="button" 
              onClick={cancelEdit} 
              className="bg-gray-100 text-gray-600 px-8 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* TABLE */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase">Customer</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-bold">{c.name}</td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => startEdit(c)} 
                    className="text-blue-600 hover:underline font-medium text-sm"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => deleteCustomer(c.id)} 
                    className="text-red-600 hover:underline font-medium text-sm ml-4"
                  >
                    Delete
                  </button>
                  <button onClick={() => navigate(`/customers/${c.id}/statement`)}
                      className="text-red-600 hover:underline font-medium text-sm ml-4"
                    >
                    Statement
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}