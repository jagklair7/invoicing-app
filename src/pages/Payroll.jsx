// src/pages/Payroll.jsx
// 2026 CRA payroll deduction rates — Alberta
// Sources:
//   CPP:      https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
//   EI:       https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/reports/premium/rates2026.html
//   Federal:  https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/income-tax/reducing-remuneration-subject-income-tax.html
//   Alberta:  https://www.alberta.ca/personal-income-tax
//   TD1AB 2026 (Basic Personal Amount = $22,769): https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1ab.html
//
// NOTE: CPP2 (second CPP tier, earnings between the YMPE and YAMPE) requires two
// new nullable columns on payroll_entries if you want YTD tracking to work:
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS cpp2 numeric DEFAULT 0;
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ytd_cpp2 numeric DEFAULT 0;

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { usePlan } from '../context/PlanContext'

// ── 2026 CRA CONSTANTS ────────────────────────────────────────────────────────

const CPP_2026 = {
  rate:              0.0595,
  basicExemption:    3500,
  maxPensionable:    74600,     // YMPE — Year's Maximum Pensionable Earnings
  maxContribution:   4230.45,
  // CPP2 — second additional tier, introduced 2024, on earnings between YMPE and YAMPE
  cpp2Rate:          0.04,
  cpp2Ceiling:       85000,     // YAMPE — Year's Additional Maximum Pensionable Earnings
  maxCpp2Contribution: 416.00,
}

const EI_2026 = {
  employeeRate:      0.0163,
  maxInsurable:      68900,
  maxPremium:        1123.07,
}

const FEDERAL_BRACKETS_2026 = [
  { min: 0,       max: 58523,   rate: 0.14   },
  { min: 58523,   max: 117045,  rate: 0.205  },
  { min: 117045,  max: 181440,  rate: 0.26   },
  { min: 181440,  max: 258482,  rate: 0.29   },
  { min: 258482,  max: Infinity,rate: 0.33   },
]
const FEDERAL_BASIC_PERSONAL_2026 = 16452

// Alberta introduced a new 8% bracket in 2025 (on the first $60,000, indexed to
// $61,200 for 2026) — this is a NEW bracket, not just an updated threshold.
const AB_BRACKETS_2026 = [
  { min: 0,       max: 61200,   rate: 0.08   },
  { min: 61200,   max: 154259,  rate: 0.10   },
  { min: 154259,  max: 185111,  rate: 0.12   },
  { min: 185111,  max: 246813,  rate: 0.13   },
  { min: 246813,  max: 370220,  rate: 0.14   },
  { min: 370220,  max: Infinity,rate: 0.15   },
]
const AB_BASIC_PERSONAL_2026 = 22769

// Pay periods per year by frequency
const PAY_PERIODS = {
  weekly:      52,
  biweekly:    26,
  semimonthly: 24,
  monthly:     12,
}

// ── CRA CALCULATION FUNCTIONS ─────────────────────────────────────────────────

/**
 * Calculate CPP deduction for a single pay period, including CPP2.
 * CRA method: annualize gross, subtract exemption, apply rate, divide back.
 *
 * Self-employed individuals pay both the employee and "employer" portions
 * themselves, so their rates and maximums are exactly double the regular
 * employee rates: base CPP 11.90% (max $8,460.90), CPP2 8.00% (max $832.00).
 *
 * Returns { cpp, cpp2, total }.
 */
function calcCPP(grossPay, frequency, ytd = { cpp: 0, cpp2: 0 }, selfEmployed = false) {
  const periods = PAY_PERIODS[frequency] || 26
  const annualGross = grossPay * periods

  const rate               = selfEmployed ? CPP_2026.rate * 2               : CPP_2026.rate
  const cpp2Rate           = selfEmployed ? CPP_2026.cpp2Rate * 2           : CPP_2026.cpp2Rate
  const maxContribution    = selfEmployed ? CPP_2026.maxContribution * 2   : CPP_2026.maxContribution
  const maxCpp2Contribution = selfEmployed ? CPP_2026.maxCpp2Contribution * 2 : CPP_2026.maxCpp2Contribution

  // ── Base CPP (tier 1): pensionable earnings between exemption and YMPE ──
  const annualPensionable = Math.min(
    Math.max(annualGross - CPP_2026.basicExemption, 0),
    CPP_2026.maxPensionable - CPP_2026.basicExemption
  )
  const annualCPP = annualPensionable * rate
  const perPeriodCPP = annualCPP / periods
  const remainingCPP = Math.max(maxContribution - (ytd.cpp || 0), 0)
  const cpp = Math.min(Math.round(perPeriodCPP * 100) / 100, remainingCPP)

  // ── CPP2 (tier 2): earnings between YMPE and YAMPE ──
  const annualCpp2Earnings = Math.min(
    Math.max(annualGross - CPP_2026.maxPensionable, 0),
    CPP_2026.cpp2Ceiling - CPP_2026.maxPensionable
  )
  const annualCpp2 = annualCpp2Earnings * cpp2Rate
  const perPeriodCpp2 = annualCpp2 / periods
  const remainingCpp2 = Math.max(maxCpp2Contribution - (ytd.cpp2 || 0), 0)
  const cpp2 = Math.min(Math.round(perPeriodCpp2 * 100) / 100, remainingCpp2)

  return { cpp, cpp2, total: cpp + cpp2 }
}

/**
 * Calculate EI premium for a single pay period
 */
function calcEI(grossPay, frequency, ytdEI = 0) {
  const periods = PAY_PERIODS[frequency] || 26
  const annualGross = grossPay * periods

  const annualInsurable = Math.min(annualGross, EI_2026.maxInsurable)
  const annualEI = annualInsurable * EI_2026.employeeRate
  const perPeriodEI = annualEI / periods

  const remaining = Math.max(EI_2026.maxPremium - ytdEI, 0)
  return Math.min(Math.round(perPeriodEI * 100) / 100, remaining)
}

/**
 * Apply progressive tax brackets to annual income
 */
function applyBrackets(annualIncome, brackets) {
  let tax = 0
  for (const bracket of brackets) {
    if (annualIncome <= bracket.min) break
    const taxable = Math.min(annualIncome, bracket.max) - bracket.min
    tax += taxable * bracket.rate
  }
  return tax
}

/**
 * Calculate federal income tax for a single pay period (CRA periodic method)
 * TD1 credits reduce the annual tax owing
 */
function calcFederalTax(grossPay, frequency, td1Credits = FEDERAL_BASIC_PERSONAL_2026) {
  const periods = PAY_PERIODS[frequency] || 26
  const annualGross = grossPay * periods

  // Apply personal amount credit
  const taxableIncome = Math.max(annualGross - td1Credits, 0)
  const annualTax = applyBrackets(taxableIncome, FEDERAL_BRACKETS_2026)
  const perPeriodTax = annualTax / periods

  return Math.max(Math.round(perPeriodTax * 100) / 100, 0)
}

/**
 * Calculate Alberta provincial income tax for a single pay period
 */
function calcProvincialTax(grossPay, frequency, td1Credits = AB_BASIC_PERSONAL_2026) {
  const periods = PAY_PERIODS[frequency] || 26
  const annualGross = grossPay * periods

  const taxableIncome = Math.max(annualGross - td1Credits, 0)
  const annualTax = applyBrackets(taxableIncome, AB_BRACKETS_2026)
  const perPeriodTax = annualTax / periods

  return Math.max(Math.round(perPeriodTax * 100) / 100, 0)
}

/**
 * Full deduction calculation for one pay run
 */
function calcDeductions(employee, grossPay, ytd = {}) {
  const freq     = employee.pay_frequency || 'biweekly'
  const td1Fed   = Number(employee.td1_credits) || FEDERAL_BASIC_PERSONAL_2026
  // AB provincial uses AB basic personal — in future can store separately
  const td1AB    = AB_BASIC_PERSONAL_2026

  const selfEmployed = !!employee.self_employed
  // Self-employed individuals are always EI exempt, regardless of the flag on file
  const eiExempt      = selfEmployed || !!employee.ei_exempt

  const cppResult      = calcCPP(grossPay, freq, { cpp: ytd.cpp || 0, cpp2: ytd.cpp2 || 0 }, selfEmployed)
  const ei             = eiExempt ? 0 : calcEI(grossPay, freq, ytd.ei || 0)
  const federal_tax    = calcFederalTax(grossPay, freq, td1Fed)
  const provincial_tax = calcProvincialTax(grossPay, freq, td1AB)
  const total          = cppResult.total + ei + federal_tax + provincial_tax
  const net            = Math.max(grossPay - total, 0)

  return {
    cpp:  cppResult.cpp,
    cpp2: cppResult.cpp2,
    ei,
    federal_tax,
    provincial_tax,
    total,
    net,
  }
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  .pr {
    --teal:     #0d7377;
    --teal-lt:  #e8f5f5;
    --teal-mid: #14a0a5;
    --slate:    #1e293b;
    --slate-mid:#475569;
    --slate-lt: #94a3b8;
    --border:   #e2e8f0;
    --bg:       #f1f5f9;
    --white:    #ffffff;
    --red:      #e53e3e;
    --amber:    #d97706;
    --green:    #059669;
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 28px 24px 60px;
  }

  .pr-header {
    max-width: 1100px; margin: 0 auto 24px;
    display: flex; align-items: flex-end;
    justify-content: space-between; flex-wrap: wrap; gap: 16px;
  }
  .pr-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px; font-weight: 600; color: var(--slate);
    letter-spacing: -0.02em; line-height: 1.1;
  }
  .pr-subtitle { font-size: 13px; color: var(--slate-lt); margin-top: 3px; }

  /* ── Buttons ── */
  .pr-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
    font-family: 'DM Sans', sans-serif; border: 1.5px solid var(--border);
    background: var(--white); color: var(--slate-mid);
    cursor: pointer; transition: all .15s; white-space: nowrap;
  }
  .pr-btn:hover { border-color: var(--slate-lt); color: var(--slate); background: #f8fafc; }
  .pr-btn--primary { background: var(--teal); color: white; border-color: var(--teal); }
  .pr-btn--primary:hover { background: var(--teal-mid); border-color: var(--teal-mid); color: white; }
  .pr-btn--danger { color: var(--red); border-color: #fecaca; }
  .pr-btn--danger:hover { background: #fff5f5; border-color: var(--red); }
  .pr-btn--ghost { background: transparent; border-color: transparent; color: var(--slate-mid); }
  .pr-btn--ghost:hover { background: var(--border); color: var(--slate); }
  .pr-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Gate ── */
  .pr-gate {
    max-width: 520px; margin: 60px auto;
    background: var(--white); border-radius: 16px;
    border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(15,23,42,.08);
    padding: 40px; text-align: center;
  }
  .pr-gate-icon { font-size: 40px; margin-bottom: 16px; }
  .pr-gate-title { font-family: 'Fraunces', Georgia, serif; font-size: 22px; font-weight: 600; color: var(--slate); margin-bottom: 10px; }
  .pr-gate-desc { font-size: 14px; color: var(--slate-mid); line-height: 1.7; margin-bottom: 24px; }

  /* ── Create form panel ── */
  .pr-panel {
    max-width: 1100px; margin: 0 auto 20px;
    background: var(--white); border-radius: 14px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;
  }
  .pr-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 22px; border-bottom: 1px solid var(--border);
  }
  .pr-panel-title { font-size: 13px; font-weight: 600; color: var(--slate); }

  /* ── Form grid ── */
  .pr-form { padding: 22px; display: flex; flex-direction: column; gap: 18px; }
  .pr-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .pr-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 700px) {
    .pr-grid-2 { grid-template-columns: 1fr; }
    .pr-grid-4 { grid-template-columns: 1fr 1fr; }
  }

  .pr-field { display: flex; flex-direction: column; gap: 5px; }
  .pr-field label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--slate-lt);
  }
  .pr-input {
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--slate);
    background: white; border: 1.5px solid var(--border); border-radius: 8px;
    padding: 8px 11px; outline: none;
    transition: border-color .15s, box-shadow .15s; width: 100%;
  }
  .pr-input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(13,115,119,0.1); }
  .pr-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center;
    padding-right: 28px; cursor: pointer;
  }

  /* ── Preview cards ── */
  .pr-preview {
    background: linear-gradient(135deg, #1e293b 0%, #2d3f55 100%);
    border-radius: 12px; padding: 20px 22px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  @media (max-width: 600px) { .pr-preview { grid-template-columns: 1fr; } }

  .pr-preview-main { display: flex; flex-direction: column; gap: 4px; }
  .pr-preview-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
  .pr-preview-value { font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 600; color: white; letter-spacing: -0.02em; }
  .pr-preview-note { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }

  .pr-deductions { display: flex; flex-direction: column; gap: 8px; justify-content: center; }
  .pr-ded-row { display: flex; justify-content: space-between; align-items: center; }
  .pr-ded-label { font-size: 11px; color: rgba(255,255,255,0.5); }
  .pr-ded-value { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; }
  .pr-ded-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 2px 0; }
  .pr-ded-row--total .pr-ded-label { color: rgba(255,255,255,0.7); font-weight: 600; }
  .pr-ded-row--total .pr-ded-value { color: white; font-weight: 700; }

  /* ── CRA notice ── */
  .pr-cra-note {
    background: var(--teal-lt); border: 1px solid #b2e0e2;
    border-radius: 10px; padding: 12px 16px;
    font-size: 12px; color: var(--teal); line-height: 1.6;
  }

  /* ── Status message ── */
  .pr-status-ok  { background: var(--teal-lt); border: 1px solid #b2e0e2; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--teal); }
  .pr-status-err { background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--red); }

  /* ── Runs table ── */
  .pr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pr-table th {
    padding: 10px 18px; font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--slate-lt); background: #f8fafc;
    border-bottom: 1px solid var(--border); text-align: left;
  }
  .pr-table td { padding: 12px 18px; border-bottom: 1px solid #f8fafc; color: var(--slate-mid); vertical-align: middle; }
  .pr-table tbody tr:last-child td { border-bottom: none; }
  .pr-table tbody tr:hover { background: #f8fafc; }
  .pr-table td:first-child { color: var(--slate); font-weight: 500; }

  /* ── Status badge ── */
  .pr-badge {
    display: inline-flex; align-items: center;
    padding: 2px 9px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .pr-badge--draft     { background: #f1f5f9; color: #94a3b8; }
  .pr-badge--processed { background: #f0fdf4; color: #059669; }
  .pr-badge--paid      { background: #eff6ff; color: #2563eb; }
  .pr-badge--canceled  { background: #fff5f5; color: #e53e3e; }

  /* ── Inline edit row ── */
  .pr-edit-row { background: #f8fafc; }

  /* ── Empty ── */
  .pr-empty { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--slate-lt); }

  /* ── Spinner ── */
  .pr-spinner {
    width: 28px; height: 28px; border: 2.5px solid var(--border);
    border-top-color: var(--teal); border-radius: 50%;
    animation: prspin .7s linear infinite; margin: 60px auto;
  }
  @keyframes prspin { to { transform: rotate(360deg); } }
`

const fmtCAD = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const DEFAULT_FORM = { employee_id: '', period_start: '', period_end: '', pay_date: '', hours_worked: '' }

export default function Payroll() {
  const { activeOrg }  = useOrg()
  const { can }        = usePlan()
  const canPayroll     = can('payroll')

  const [employees, setEmployees] = useState([])
  const [runs, setRuns]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(DEFAULT_FORM)
  const [saving, setSaving]       = useState(false)
  const [statusMsg, setStatusMsg] = useState(null) // { ok, text }

  // Inline edit state
  const [editId, setEditId]     = useState(null)
  const [editData, setEditData] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (activeOrg?.orgId) fetchAll()
  }, [activeOrg?.orgId])

  async function fetchAll() {
    setLoading(true)
    const [empRes, runsRes] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', activeOrg.orgId).eq('status', 'active').order('name'),
      supabase.from('payroll_runs').select('*').eq('org_id', activeOrg.orgId).order('pay_date', { ascending: false }),
    ])
    setEmployees(empRes.data || [])
    setRuns(runsRes.data || [])
    setLoading(false)
  }

  // ── Selected employee ──
  const selectedEmp = useMemo(
    () => employees.find(e => e.id === form.employee_id) || null,
    [employees, form.employee_id]
  )

  // ── Live deduction preview ──
  const grossPreview = useMemo(() => {
    if (!selectedEmp) return 0
    if (selectedEmp.pay_type === 'hourly') return (Number(selectedEmp.pay_rate) || 0) * (Number(form.hours_worked) || 0)
    return Number(selectedEmp.pay_rate) || 0
  }, [selectedEmp, form.hours_worked])

  const deductionPreview = useMemo(() => {
    if (!selectedEmp || grossPreview <= 0) return { cpp: 0, cpp2: 0, ei: 0, federal_tax: 0, provincial_tax: 0, total: 0, net: 0 }
    return calcDeductions(selectedEmp, grossPreview)
  }, [selectedEmp, grossPreview])

  // ── Create payroll run ──
  async function handleCreate(e) {
    e.preventDefault()
    setStatusMsg(null)
    if (!canPayroll) return setStatusMsg({ ok: false, text: 'Payroll not available on your plan.' })
    if (!selectedEmp) return setStatusMsg({ ok: false, text: 'Select an employee.' })
    if (!form.period_start || !form.period_end || !form.pay_date) return setStatusMsg({ ok: false, text: 'Fill in all date fields.' })
    if (selectedEmp.pay_type === 'hourly' && !form.hours_worked) return setStatusMsg({ ok: false, text: 'Enter hours worked.' })

    setSaving(true)
    try {
      // Get YTD totals for this employee
      const { data: pastEntries } = await supabase
        .from('payroll_entries')
        .select('gross, cpp, cpp2, ei, federal_tax, provincial_tax')
        .eq('org_id', activeOrg.orgId)
        .eq('employee_id', selectedEmp.id)

      const ytd = (pastEntries || []).reduce((acc, p) => ({
        cpp:  acc.cpp  + Number(p.cpp  || 0),
        cpp2: acc.cpp2 + Number(p.cpp2 || 0),
        ei:   acc.ei   + Number(p.ei   || 0),
      }), { cpp: 0, cpp2: 0, ei: 0 })

      const gross = grossPreview
      const ded   = calcDeductions(selectedEmp, gross, ytd)

      const ytdGross = (pastEntries || []).reduce((s, p) => s + Number(p.gross || 0), 0) + gross
      const ytdCPP   = ytd.cpp  + ded.cpp
      const ytdCPP2  = ytd.cpp2 + ded.cpp2
      const ytdEI    = ytd.ei   + ded.ei
      const ytdTax   = (pastEntries || []).reduce((s, p) => s + Number(p.federal_tax || 0) + Number(p.provincial_tax || 0), 0) + ded.federal_tax + ded.provincial_tax

      const { data: run, error: runErr } = await supabase
        .from('payroll_runs')
        .insert([{
          org_id:            activeOrg.orgId,
          period_start:      form.period_start,
          period_end:        form.period_end,
          pay_date:          form.pay_date,
          status:            'processed',
          total_gross:       gross,
          total_deductions:  ded.total,
          total_net:         ded.net,
        }])
        .select().single()
      if (runErr) throw runErr

      const { error: entryErr } = await supabase
        .from('payroll_entries')
        .insert([{
          payroll_run_id:  run.id,
          org_id:          activeOrg.orgId,
          employee_id:     selectedEmp.id,
          hours_worked:    selectedEmp.pay_type === 'hourly' ? Number(form.hours_worked) : null,
          gross,
          cpp:             ded.cpp,
          cpp2:            ded.cpp2,
          ei:              ded.ei,
          federal_tax:     ded.federal_tax,
          provincial_tax:  ded.provincial_tax,
          net:             ded.net,
          ytd_gross:       ytdGross,
          ytd_cpp:         ytdCPP,
          ytd_cpp2:        ytdCPP2,
          ytd_ei:          ytdEI,
          ytd_tax:         ytdTax,
        }])
      if (entryErr) throw entryErr

      setStatusMsg({ ok: true, text: `Payroll run created. Net pay: ${fmtCAD(ded.net)}` })
      setForm(DEFAULT_FORM)
      fetchAll()
    } catch (err) {
      setStatusMsg({ ok: false, text: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ── Edit run ──
  function startEdit(run) {
    setEditId(run.id)
    setEditData({ period_start: run.period_start, period_end: run.period_end, pay_date: run.pay_date, status: run.status })
  }
  function cancelEdit() { setEditId(null); setEditData({}) }

  async function saveEdit(runId) {
    setEditSaving(true)
    const { error } = await supabase.from('payroll_runs').update(editData).eq('id', runId).eq('org_id', activeOrg.orgId)
    if (error) setStatusMsg({ ok: false, text: error.message })
    else { setStatusMsg({ ok: true, text: 'Run updated.' }); cancelEdit(); fetchAll() }
    setEditSaving(false)
  }

  async function deleteRun(run) {
    if (!window.confirm(`Delete payroll run for ${fmtDate(run.pay_date)}? This also removes its entries.`)) return
    await supabase.from('payroll_runs').delete().eq('id', run.id).eq('org_id', activeOrg.orgId)
    setStatusMsg({ ok: true, text: 'Run deleted.' })
    fetchAll()
  }

  // ── Plan gate ──
  if (!canPayroll) return (
    <>
      <style>{css}</style>
      <div className="pr">
        <div className="pr-gate">
          <div className="pr-gate-icon">🔒</div>
          <div className="pr-gate-title">Payroll requires a paid plan</div>
          <div className="pr-gate-desc">Upgrade to Starter or higher to run payroll with accurate CRA deductions for CPP, EI, and income tax.</div>
          <button className="pr-btn pr-btn--primary" style={{ padding: '11px 28px', fontSize: 14 }} onClick={() => window.location.href = '/settings'}>
            Upgrade Plan →
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div className="pr">

        {/* Header */}
        <div className="pr-header">
          <div>
            <div className="pr-title">Payroll</div>
            <div className="pr-subtitle">2026 CRA rates · Alberta · {employees.length} active employee{employees.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Create run form */}
        <div className="pr-panel">
          <div className="pr-panel-header">
            <span className="pr-panel-title">New Payroll Run</span>
          </div>
          <form className="pr-form" onSubmit={handleCreate}>

            {/* Employee + dates */}
            <div className="pr-grid-2">
              <div className="pr-field">
                <label>Employee *</label>
                <select className="pr-input pr-select" value={form.employee_id}
                  onChange={e => setForm(p => ({ ...p, employee_id: e.target.value, hours_worked: '' }))}>
                  <option value="">Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.pay_type === 'hourly' ? `$${Number(emp.pay_rate).toFixed(2)}/hr` : `$${Number(emp.pay_rate).toFixed(2)}/yr`} · {emp.pay_frequency} · {emp.province}
                    </option>
                  ))}
                </select>
              </div>
              {selectedEmp?.pay_type === 'hourly' && (
                <div className="pr-field">
                  <label>Hours Worked *</label>
                  <input className="pr-input" type="number" min="0" step="0.25"
                    placeholder="e.g. 80" value={form.hours_worked}
                    onChange={e => setForm(p => ({ ...p, hours_worked: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="pr-grid-2">
              <div className="pr-field">
                <label>Period Start *</label>
                <input className="pr-input" type="date" value={form.period_start}
                  onChange={e => setForm(p => ({ ...p, period_start: e.target.value }))} />
              </div>
              <div className="pr-field">
                <label>Period End *</label>
                <input className="pr-input" type="date" value={form.period_end}
                  onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>

            <div style={{ maxWidth: 320 }}>
              <div className="pr-field">
                <label>Pay Date *</label>
                <input className="pr-input" type="date" value={form.pay_date}
                  onChange={e => setForm(p => ({ ...p, pay_date: e.target.value }))} />
              </div>
            </div>

            {/* Live deduction preview */}
            {selectedEmp && grossPreview > 0 && (
              <div className="pr-preview">
                <div className="pr-preview-main">
                  <div className="pr-preview-label">Gross Pay</div>
                  <div className="pr-preview-value">{fmtCAD(grossPreview)}</div>
                  <div className="pr-preview-note">
                    {selectedEmp.pay_type === 'hourly'
                      ? `${form.hours_worked}h × ${fmtCAD(selectedEmp.pay_rate)}/hr`
                      : `${selectedEmp.pay_frequency} salary`}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div className="pr-preview-label">Net Pay</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 600, color: '#6ee7b7', letterSpacing: '-0.02em', marginTop: 2 }}>
                      {fmtCAD(deductionPreview.net)}
                    </div>
                  </div>
                </div>
                <div className="pr-deductions">
                  <div className="pr-ded-row">
                    <span className="pr-ded-label">CPP ({selectedEmp.self_employed ? '11.90%' : '5.95%'})</span>
                    <span className="pr-ded-value">{fmtCAD(deductionPreview.cpp)}</span>
                  </div>
                  {deductionPreview.cpp2 > 0 && (
                    <div className="pr-ded-row">
                      <span className="pr-ded-label">CPP2 ({selectedEmp.self_employed ? '8%' : '4%'})</span>
                      <span className="pr-ded-value">{fmtCAD(deductionPreview.cpp2)}</span>
                    </div>
                  )}
                  <div className="pr-ded-row">
                    <span className="pr-ded-label">EI {(selectedEmp.self_employed || selectedEmp.ei_exempt) ? '(exempt)' : '(1.63%)'}</span>
                    <span className="pr-ded-value">{fmtCAD(deductionPreview.ei)}</span>
                  </div>
                  <div className="pr-ded-row">
                    <span className="pr-ded-label">Federal tax</span>
                    <span className="pr-ded-value">{fmtCAD(deductionPreview.federal_tax)}</span>
                  </div>
                  <div className="pr-ded-row">
                    <span className="pr-ded-label">AB Provincial</span>
                    <span className="pr-ded-value">{fmtCAD(deductionPreview.provincial_tax)}</span>
                  </div>
                  <div className="pr-ded-divider" />
                  <div className="pr-ded-row pr-ded-row--total">
                    <span className="pr-ded-label">Total deductions</span>
                    <span className="pr-ded-value">{fmtCAD(deductionPreview.total)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* CRA rates notice */}
            <div className="pr-cra-note">
              ✓ Using 2026 CRA rates — CPP 5.95% to $74,600 (max $4,230.45) + CPP2 4% to $85,000 (max $416) · EI 1.63% (max $1,123.07) · Federal brackets 14%–33% (BPA $16,452) · Alberta brackets 8%–15% (BPA $22,769)
            </div>

            {statusMsg && (
              <div className={statusMsg.ok ? 'pr-status-ok' : 'pr-status-err'}>
                {statusMsg.ok ? '✓' : '⚠'} {statusMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="pr-btn pr-btn--primary" type="submit" disabled={saving || !form.employee_id || !form.period_start || !form.period_end || !form.pay_date}>
                {saving ? 'Creating…' : '+ Create Payroll Run'}
              </button>
            </div>
          </form>
        </div>

        {/* Runs table */}
        <div className="pr-panel">
          <div className="pr-panel-header">
            <span className="pr-panel-title">Payroll History</span>
          </div>
          {loading ? (
            <div className="pr-spinner" />
          ) : runs.length === 0 ? (
            <div className="pr-empty">No payroll runs yet. Create one above.</div>
          ) : (
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Pay Date</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>Deductions</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                  <th>Status</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => editId === run.id ? (
                  <tr key={run.id} className="pr-edit-row">
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input className="pr-input" type="date" value={editData.period_start}
                          onChange={e => setEditData(p => ({ ...p, period_start: e.target.value }))}
                          style={{ width: 130, fontSize: 12, padding: '5px 8px' }} />
                        <span style={{ color: '#94a3b8' }}>→</span>
                        <input className="pr-input" type="date" value={editData.period_end}
                          onChange={e => setEditData(p => ({ ...p, period_end: e.target.value }))}
                          style={{ width: 130, fontSize: 12, padding: '5px 8px' }} />
                      </div>
                    </td>
                    <td>
                      <input className="pr-input" type="date" value={editData.pay_date}
                        onChange={e => setEditData(p => ({ ...p, pay_date: e.target.value }))}
                        style={{ width: 140, fontSize: 12, padding: '5px 8px' }} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtCAD(run.total_gross)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCAD(run.total_deductions)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCAD(run.total_net)}</td>
                    <td>
                      <select className="pr-input pr-select" value={editData.status}
                        onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}
                        style={{ fontSize: 12, padding: '5px 8px', width: 120 }}>
                        <option value="draft">Draft</option>
                        <option value="processed">Processed</option>
                        <option value="paid">Paid</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="pr-btn pr-btn--primary" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => saveEdit(run.id)} disabled={editSaving}>
                          {editSaving ? '…' : 'Save'}
                        </button>
                        <button className="pr-btn pr-btn--ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={run.id}>
                    <td>{fmtDate(run.period_start)} → {fmtDate(run.period_end)}</td>
                    <td>{fmtDate(run.pay_date)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtCAD(run.total_gross)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#e53e3e' }}>{fmtCAD(run.total_deductions)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#059669', fontWeight: 600 }}>{fmtCAD(run.total_net)}</td>
                    <td><span className={`pr-badge pr-badge--${run.status}`}>{run.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="pr-btn" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => startEdit(run)}>Edit</button>
                        <button className="pr-btn pr-btn--danger" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => deleteRun(run)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </>
  )
}
