import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { usePlan } from '../context/PlanContext'

const DEFAULT_PAY_ENTRY = {
  employee_id: '',
  period_start: '',
  period_end: '',
  pay_date: '',
  hours_worked: '',
}

export default function Payroll() {
  const { activeOrg } = useOrg()
  const { can } = usePlan()
  const [employees, setEmployees] = useState([])
  const [runs, setRuns] = useState([])
  const [form, setForm] = useState(DEFAULT_PAY_ENTRY)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [editRunId, setEditRunId] = useState(null)
  const [editRunData, setEditRunData] = useState({ period_start: '', period_end: '', pay_date: '', status: 'processed' })
  const [editSaving, setEditSaving] = useState(false)

  const canPayroll = can('payroll')

  useEffect(() => {
    if (activeOrg?.orgId) {
      fetchEmployees()
      fetchRuns()
    }
  }, [activeOrg?.orgId])

  async function fetchEmployees() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setEmployees(data || [])
  }

  async function fetchRuns() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('pay_date', { ascending: false })
    setRuns(data || [])
  }

  const startEditRun = (run) => {
    setEditRunId(run.id)
    setEditRunData({
      period_start: run.period_start || '',
      period_end: run.period_end || '',
      pay_date: run.pay_date || '',
      status: run.status || 'processed',
    })
  }

  const cancelEditRun = () => {
    setEditRunId(null)
    setEditRunData({ period_start: '', period_end: '', pay_date: '', status: 'processed' })
    setEditSaving(false)
  }

  async function saveRunEdit(runId) {
    if (!activeOrg?.orgId) return
    if (!editRunData.period_start || !editRunData.period_end || !editRunData.pay_date) return

    setEditSaving(true)
    const { error } = await supabase
      .from('payroll_runs')
      .update({
        period_start: editRunData.period_start,
        period_end: editRunData.period_end,
        pay_date: editRunData.pay_date,
        status: editRunData.status,
      })
      .eq('id', runId)

    if (error) {
      setStatusMessage(error.message || 'Unable to update payroll run.')
    } else {
      setStatusMessage('Payroll run updated successfully.')
      await fetchRuns()
      cancelEditRun()
    }

    setEditSaving(false)
  }

  async function deleteRun(runId) {
    if (!window.confirm('Delete this payroll run? This will also remove its payroll entries.')) return
    const { error } = await supabase
      .from('payroll_runs')
      .delete()
      .eq('id', runId)

    if (error) {
      setStatusMessage(error.message || 'Unable to delete payroll run.')
      return
    }

    setStatusMessage('Payroll run deleted successfully.')
    if (editRunId === runId) cancelEditRun()
    fetchRuns()
  }

  const selectedEmployee = useMemo(
    () => employees.find(emp => emp.id === form.employee_id) || null,
    [employees, form.employee_id]
  )

  const canCreate = canPayroll && form.employee_id && form.pay_date && form.period_start && form.period_end

  const computeGross = () => {
    if (!selectedEmployee) return 0
    const payRate = Number(selectedEmployee.pay_rate) || 0
    if (selectedEmployee.pay_type === 'hourly') {
      const hours = Number(form.hours_worked) || 0
      return payRate * hours
    }
    return payRate
  }

  const gross = computeGross()
  const deductions = useMemo(() => {
    const cpp = Number((gross * 0.0525).toFixed(2))
    const ei = Number((gross * 0.0162).toFixed(2))
    const federal_tax = Number((gross * 0.15).toFixed(2))
    const provincial_tax = Number((gross * 0.05).toFixed(2))
    return { cpp, ei, federal_tax, provincial_tax }
  }, [gross])

  const handleCreateRun = async (e) => {
    e.preventDefault()
    setStatusMessage('')
    if (!activeOrg?.orgId || !canCreate) return
    if (!canPayroll) {
      setStatusMessage('Payroll is unavailable on your current plan.')
      return
    }
    if (!selectedEmployee) {
      setStatusMessage('Select an employee to create a payroll run.')
      return
    }
    if (selectedEmployee.pay_type === 'hourly' && !form.hours_worked) {
      setStatusMessage('Enter hours worked for hourly employees.')
      return
    }

    setSaving(true)

    try {
      const totalDeductions = deductions.cpp + deductions.ei + deductions.federal_tax + deductions.provincial_tax
      const net = Number((gross - totalDeductions).toFixed(2))

      const { data: runData, error: runError } = await supabase
        .from('payroll_runs')
        .insert([{ org_id: activeOrg.orgId, period_start: form.period_start, period_end: form.period_end, pay_date: form.pay_date, status: 'processed', total_gross: gross, total_deductions: totalDeductions, total_net: net }])
        .select()
        .single()

      if (runError) throw runError

      const { data: pastEntries } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('org_id', activeOrg.orgId)
        .eq('employee_id', selectedEmployee.id)

      const ytdGross = (pastEntries || []).reduce((sum, item) => sum + Number(item.gross || 0), 0) + gross
      const ytdCpp = (pastEntries || []).reduce((sum, item) => sum + Number(item.cpp || 0), 0) + deductions.cpp
      const ytdEi = (pastEntries || []).reduce((sum, item) => sum + Number(item.ei || 0), 0) + deductions.ei
      const ytdTax = (pastEntries || []).reduce((sum, item) => sum + Number(item.federal_tax || 0) + Number(item.provincial_tax || 0), 0) + deductions.federal_tax + deductions.provincial_tax

      const { error: entryError } = await supabase
        .from('payroll_entries')
        .insert([{ payroll_run_id: runData.id, org_id: activeOrg.orgId, employee_id: selectedEmployee.id, hours_worked: selectedEmployee.pay_type === 'hourly' ? Number(form.hours_worked) || 0 : null, gross, cpp: deductions.cpp, ei: deductions.ei, federal_tax: deductions.federal_tax, provincial_tax: deductions.provincial_tax, net, ytd_gross: ytdGross, ytd_cpp: ytdCpp, ytd_ei: ytdEi, ytd_tax: ytdTax }])

      if (entryError) throw entryError

      setStatusMessage('Payroll run created successfully.')
      setForm(DEFAULT_PAY_ENTRY)
      fetchRuns()
    } catch (err) {
      setStatusMessage(err.message || 'Unable to create payroll run.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          {activeOrg && <p className="text-sm text-gray-400 mt-1">{activeOrg.name}</p>}
        </div>
      </div>

      {!canPayroll ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-8 text-amber-900">
          <strong className="block text-sm font-semibold mb-2">Payroll is unavailable</strong>
          <p className="text-sm leading-6">Your current plan does not include payroll. Upgrade to Starter or higher to add payroll runs.</p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-10">
          <h2 className="text-lg font-semibold mb-4">Create payroll run</h2>
          <form onSubmit={handleCreateRun} className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Employee</label>
              <select name="employee_id" value={form.employee_id} onChange={e => setForm(prev => ({ ...prev, employee_id: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
                <option value="">Select employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} — {emp.pay_type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Period start</label>
              <input name="period_start" type="date" value={form.period_start} onChange={e => setForm(prev => ({ ...prev, period_start: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Period end</label>
              <input name="period_end" type="date" value={form.period_end} onChange={e => setForm(prev => ({ ...prev, period_end: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pay date</label>
              <input name="pay_date" type="date" value={form.pay_date} onChange={e => setForm(prev => ({ ...prev, pay_date: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
            </div>
            {selectedEmployee?.pay_type === 'hourly' && (
              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Hours worked</label>
                <input name="hours_worked" type="number" step="0.25" min="0" value={form.hours_worked} onChange={e => setForm(prev => ({ ...prev, hours_worked: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" placeholder="e.g. 80" />
              </div>
            )}
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Gross pay</div>
                <div className="text-xl font-semibold text-slate-900">${gross.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Net pay</div>
                <div className="text-xl font-semibold text-slate-900">${(gross - (deductions.cpp + deductions.ei + deductions.federal_tax + deductions.provincial_tax)).toFixed(2)}</div>
              </div>
            </div>
            <div className="lg:col-span-2"> 
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">CPP</div>
                  <div className="text-lg font-semibold text-slate-900">${deductions.cpp.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">EI</div>
                  <div className="text-lg font-semibold text-slate-900">${deductions.ei.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Federal tax</div>
                  <div className="text-lg font-semibold text-slate-900">${deductions.federal_tax.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Provincial tax</div>
                  <div className="text-lg font-semibold text-slate-900">${deductions.provincial_tax.toFixed(2)}</div>
                </div>
              </div>
            </div>
            {statusMessage && (
              <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-slate-50 p-4 text-sm text-slate-700">{statusMessage}</div>
            )}
            <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">{employees.length} active employee{employees.length === 1 ? '' : 's'} available for payroll</div>
              <button type="submit" disabled={!canCreate || saving}
                className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 transition">
                {saving ? 'Creating...' : 'Create payroll run'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Period</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Pay date</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Gross</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Net</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-gray-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No payroll runs yet. Create one to start recording payments.</td>
              </tr>
            ) : runs.map(run => (
              editRunId === run.id ? (
                <tr key={run.id} className="bg-slate-50">
                  <td className="px-6 py-4">
                    <input value={editRunData.period_start} onChange={e => setEditRunData(prev => ({ ...prev, period_start: e.target.value }))}
                      type="date" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
                  </td>
                  <td className="px-6 py-4">
                    <input value={editRunData.pay_date} onChange={e => setEditRunData(prev => ({ ...prev, pay_date: e.target.value }))}
                      type="date" className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
                  </td>
                  <td className="px-6 py-4">${Number(run.total_gross || 0).toFixed(2)}</td>
                  <td className="px-6 py-4">${Number(run.total_net || 0).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <select value={editRunData.status} onChange={e => setEditRunData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none">
                      <option value="draft">Draft</option>
                      <option value="processed">Processed</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button type="button" onClick={() => saveRunEdit(run.id)} disabled={editSaving}
                      className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition">
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={cancelEditRun}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={run.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">{run.period_start} → {run.period_end}</td>
                  <td className="px-6 py-4">{run.pay_date}</td>
                  <td className="px-6 py-4">${Number(run.total_gross || 0).toFixed(2)}</td>
                  <td className="px-6 py-4">${Number(run.total_net || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 capitalize text-slate-700">{run.status}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button type="button" onClick={() => startEditRun(run)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteRun(run.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition">
                      Delete
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
