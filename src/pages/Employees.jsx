import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { usePlan } from '../context/PlanContext'

const PROVINCES = [
  'AB','BC','MB','NB','NL','NS','ON','PE','QC','SK','NT','NU','YT'
]

const PAY_TYPES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
]

const FREQUENCIES = [
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'semimonthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
]

const DEFAULT_FORM = {
  name: '',
  email: '',
  phone: '',
  pay_type: 'hourly',
  pay_rate: '0.00',
  pay_frequency: 'biweekly',
  province: 'AB',
  td1_credits: '15705',
  start_date: '',
  status: 'active',
  self_employed: false,
  ei_exempt: false,
}

export default function Employees() {
  const { activeOrg } = useOrg()
  const { can, withinLimit, features } = usePlan()
  const [employees, setEmployees] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(DEFAULT_FORM)

  useEffect(() => {
    if (activeOrg?.orgId) fetchEmployees()
  }, [activeOrg?.orgId])

  async function fetchEmployees() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: false })

    setEmployees(data || [])
  }

  async function deleteEmployee(id) {
    if (!window.confirm('Delete this employee?')) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) {
      alert('Error deleting employee: ' + error.message)
      return
    }
    fetchEmployees()
  }

  const canAdd = withinLimit('max_employees', employees.length)
  const canUsePayroll = can('payroll')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!activeOrg?.orgId) return
    if (!canUsePayroll) {
      setError('Payroll is not available on your current plan.')
      return
    }

    if (!formData.name.trim()) {
      setError('Employee name is required.')
      return
    }

    if (!editingId && !canAdd) {
      setError('Employee limit reached for your plan.')
      return
    }

    setSaving(true)

    const payload = {
      org_id: activeOrg.orgId,
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      pay_type: formData.pay_type,
      pay_rate: parseFloat(formData.pay_rate) || 0,
      pay_frequency: formData.pay_frequency,
      province: formData.province,
      td1_credits: parseFloat(formData.td1_credits) || 15705,
      start_date: formData.start_date || null,
      status: formData.status,
      self_employed: !!formData.self_employed,
      // Self-employed workers are never eligible for EI, regardless of the checkbox state
      ei_exempt: !!formData.self_employed || !!formData.ei_exempt,
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert([payload])
        if (error) throw error
      }

      setEditingId(null)
      setFormData(DEFAULT_FORM)
      fetchEmployees()
    } catch (err) {
      setError(err.message || 'Unable to save employee.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (employee) => {
    setEditingId(employee.id)
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      pay_type: employee.pay_type || 'hourly',
      pay_rate: employee.pay_rate?.toString() || '0.00',
      pay_frequency: employee.pay_frequency || 'biweekly',
      province: employee.province || 'AB',
      td1_credits: employee.td1_credits?.toString() || '15705',
      start_date: employee.start_date || '',
      status: employee.status || 'active',
      self_employed: !!employee.self_employed,
      ei_exempt: !!employee.ei_exempt,
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

  const handleSelfEmployedChange = (e) => {
    const checked = e.target.checked
    setFormData(prev => ({
      ...prev,
      self_employed: checked,
      // Auto-check EI Exempt when marking self-employed — CRA doesn't
      // collect EI premiums from self-employed individuals
      ei_exempt: checked ? true : prev.ei_exempt,
    }))
  }

  const handleEiExemptChange = (e) => {
    setFormData(prev => ({ ...prev, ei_exempt: e.target.checked }))
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          {activeOrg && <p className="text-sm text-gray-400 mt-1">{activeOrg.name}</p>}
        </div>
        <div className="text-sm text-gray-500">
          Plan: <span className="font-semibold text-slate-700">{features.plan_name || 'free'}</span>
          <span className="ml-3">Employee limit: {features.max_employees === -1 ? 'Unlimited' : features.max_employees}</span>
        </div>
      </div>

      {!canUsePayroll && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-8 text-amber-900">
          <strong className="block text-sm font-semibold mb-2">Payroll is unavailable</strong>
          <p className="text-sm leading-6">Your current plan does not include payroll. Upgrade to Starter or higher to manage employees and run payroll.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Name *</label>
            <input name="name" required value={formData.name} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="Employee name" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Email</label>
            <input name="email" type="email" value={formData.email} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="name@example.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Phone</label>
            <input name="phone" value={formData.phone} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay type</label>
            <select name="pay_type" value={formData.pay_type} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
              {PAY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input name="pay_rate" value={formData.pay_rate} onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                type="number" step="0.01" min="0" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay frequency</label>
            <select name="pay_frequency" value={formData.pay_frequency} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
              {FREQUENCIES.map(freq => <option key={freq.value} value={freq.value}>{freq.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Province</label>
            <select name="province" value={formData.province} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
              {PROVINCES.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">TD1 credits</label>
            <input name="td1_credits" value={formData.td1_credits} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              type="number" step="0.01" min="0" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Start date</label>
            <input name="start_date" value={formData.start_date} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              type="date" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Status</label>
            <select name="status" value={formData.status} onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Self-employed / EI exempt */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 cursor-pointer hover:border-teal-300 transition">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              checked={formData.self_employed}
              onChange={handleSelfEmployedChange}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Self-employed</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Pays the full CPP contribution (employee + employer share) and is not eligible for EI.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 cursor-pointer hover:border-teal-300 transition">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              checked={formData.ei_exempt}
              disabled={formData.self_employed}
              onChange={handleEiExemptChange}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">EI exempt</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {formData.self_employed
                  ? 'Automatically applied for self-employed workers.'
                  : 'For other EI-exempt situations (e.g. family employment, over-65 exclusions).'}
              </span>
            </span>
          </label>
        </div>

        {error && <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-600 transition">
            {editingId ? 'Update employee' : 'Add employee'}
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
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Employee</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Pay</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Frequency</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-right text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No employees found. Add your first employee to start payroll.</td>
              </tr>
            ) : employees.map(employee => (
              <tr key={employee.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900">{employee.name}</div>
                  <div className="text-xs text-slate-500">{employee.email || employee.phone || 'No contact info'}</div>
                  <div className="mt-1 flex gap-1.5">
                    {employee.self_employed && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                        Self-employed
                      </span>
                    )}
                    {employee.ei_exempt && !employee.self_employed && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                        EI exempt
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-700">${Number(employee.pay_rate).toFixed(2)}</td>
                <td className="px-6 py-4 text-slate-700">{employee.pay_frequency}</td>
                <td className="px-6 py-4 text-slate-700 capitalize">{employee.status}</td>
                <td className="px-6 py-4 text-right space-x-4">
                  <button onClick={() => startEdit(employee)} className="text-teal-600 hover:underline text-sm font-semibold">Edit</button>
                  <button onClick={() => deleteEmployee(employee.id)} className="text-red-500 hover:underline text-sm font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
