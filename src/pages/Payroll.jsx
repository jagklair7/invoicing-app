// src/pages/Payroll.jsx
// 2026 CRA payroll deduction rates — Alberta
// Sources:
//   T4127 (122nd ed., eff. Jan 1 2026): https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan.html
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
//
// NOTE (Aug 2026): Remittance slip feature requires these additional columns.
// Employer-match amounts and total remittance are calculated and stored at
// creation time (not recalculated later) so slips stay accurate for a given
// pay run even after CRA rates change in a future year:
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS employer_cpp numeric DEFAULT 0;
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS employer_cpp2 numeric DEFAULT 0;
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS employer_ei numeric DEFAULT 0;
//   ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS total_remittance numeric DEFAULT 0;
//   ALTER TABLE payroll_runs    ADD COLUMN IF NOT EXISTS total_remittance numeric DEFAULT 0;
//
// FIX (Aug 2026): Federal/provincial tax were computed as a naive
// "annualize → subtract BPA → apply brackets" calculation. That undercounts
// two things CRA's real T4127 formula applies:
//   1. F5A — the "enhanced" portion of CPP (the extra 1.00% of the 5.95% base
//      rate, plus 100% of CPP2) is a DEDUCTION from taxable income, not just
//      a deduction from cash. It has to come off gross pay before annualizing.
//   2. K1/K2/K4 — CPP and EI premiums generate their own non-refundable tax
//      credit (K1 = BPA credit, K2 = CPP/EI credit) on top of the personal
//      amount, and federal tax also gets a separate Canada Employment Amount
//      credit (K4). AB has an equivalent K1P/K2P (no K4P — that's Yukon-only).
// Verified against the CRA PDOC (apps.cra-arc.gc.ca) for a $3,000/mo salary:
// federal $187.99, AB provincial $75.32 — matches to the cent.

import { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { usePlan } from '../context/PlanContext'
import SuspendedBanner from '../components/SuspendedBanner'

// ── 2026 CRA CONSTANTS ────────────────────────────────────────────────────────

const CPP_2026 = {
  rate:              0.0595,
  baseRate:          0.0495,   // "base" CPP — the only portion that earns a K1/K2 tax credit
  enhancedRate:      0.0100,   // "first additional" CPP — deductible from taxable income (F5A), not credited
  basicExemption:    3500,
  maxPensionable:    74600,     // YMPE — Year's Maximum Pensionable Earnings
  maxContribution:   4230.45,
  maxBaseContribution: 3519.45, // cap used in the K2/K2P credit formula
  // CPP2 — second additional tier, introduced 2024, on earnings between YMPE and YAMPE
  // CPP2 is entirely "enhanced" — fully deductible from taxable income, never credited.
  cpp2Rate:          0.04,
  cpp2Ceiling:       85000,     // YAMPE — Year's Additional Maximum Pensionable Earnings
  maxCpp2Contribution: 416.00,
}

const EI_2026 = {
  employeeRate:      0.0163,
  maxInsurable:      68900,
  maxPremium:        1123.07,
  employerMultiplier: 1.4,   // employer EI premium = 1.4x the employee's premium (standard rate outside Quebec)
}

const FEDERAL_BRACKETS_2026 = [
  { min: 0,       max: 58523,   rate: 0.14   },
  { min: 58523,   max: 117045,  rate: 0.205  },
  { min: 117045,  max: 181440,  rate: 0.26   },
  { min: 181440,  max: 258482,  rate: 0.29   },
  { min: 258482,  max: Infinity,rate: 0.33   },
]
const FEDERAL_BASIC_PERSONAL_2026 = 16452
const FEDERAL_LOWEST_RATE_2026 = 0.14   // used to compute K1 (BPA credit), K2 (CPP/EI credit), K4 (employment amount credit)
const CEA_2026 = 1501                    // Canada Employment Amount (T4127 Table 8.2) — federal-only credit base

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
const AB_LOWEST_RATE_2026 = 0.08         // used to compute K1P (BPA credit) and K2P (CPP/EI credit)
const AB_K5P_THRESHOLD = 4896            // AB-specific clawback: (K1P+K2P - 4896) * 0.25, floored at 0

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
 * (Note: self-employed CPP has additional deduction/credit-splitting rules
 * under the Income Tax Act that this simplified model does not yet apply —
 * flag for follow-up if self-employed payroll accuracy matters to you.)
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

  // annualPensionable is exposed so tax functions can derive the F5A deduction
  // and K2/K2P credit basis directly from earnings (per CRA's actual formula),
  // rather than reverse-engineering them from the rounded-to-cents withholding
  // amount above — using the rounded figure for those introduces a
  // sub-cent drift that occasionally flips the final tax by a penny.
  return { cpp, cpp2, total: cpp + cpp2, annualPensionable }
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
 * Apply progressive tax brackets to annual income.
 * Mathematically equivalent to CRA's "R × A – K" shortcut (Table 8.1),
 * just computed piecewise instead of via the constant K.
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
 * F5A — CRA's "CPP enhancement" deduction for the pay period.
 * This is the portion of CPP contributions that reduces TAXABLE INCOME
 * (rather than generating a tax credit): the 1.00% "first additional" slice
 * of base CPP, plus 100% of CPP2. Ref: T4127 Chapter 4, Step 1, factor F5.
 *
 * Derived directly from annualPensionable (the same earnings basis CRA's
 * formula uses), NOT from the cpp figure already rounded to cents for the
 * employee's pay stub — using the rounded figure here introduces enough
 * sub-cent drift to occasionally flip the final tax by a penny.
 */
function calcF5A(annualPensionable, cpp2, periods, selfEmployed) {
  const enhancedRate = selfEmployed ? CPP_2026.enhancedRate * 2 : CPP_2026.enhancedRate
  const perPeriodEnhanced = (annualPensionable * enhancedRate) / periods
  return perPeriodEnhanced + cpp2
}

/**
 * K2/K2P credit basis — the "base" (non-enhanced) CPP contribution used for
 * the CPP tax credit, computed directly from annualPensionable per CRA's
 * formula (0.0495 × pensionable earnings, capped), not by ratio-scaling the
 * rounded per-period withholding amount.
 */
function calcCPPCreditBasis(annualPensionable, selfEmployed) {
  const baseRate = selfEmployed ? CPP_2026.baseRate * 2 : CPP_2026.baseRate
  const maxBase  = selfEmployed ? CPP_2026.maxBaseContribution * 2 : CPP_2026.maxBaseContribution
  return Math.min(baseRate * annualPensionable, maxBase)
}

/**
 * Calculate federal income tax for a single pay period using CRA's actual
 * T4127 Option 1 method: tax on annual income (after the CPP-enhancement
 * deduction) minus K1 (BPA credit) minus K2 (CPP/EI credit) minus K4
 * (Canada Employment Amount credit).
 */
function calcFederalTax(grossPay, frequency, td1Credits, annualPensionable, cpp2, ei, selfEmployed) {
  const periods = PAY_PERIODS[frequency] || 26
  const annualGrossBox14 = grossPay * periods            // gross employment income before any deductions — used for K4
  const f5a = calcF5A(annualPensionable, cpp2, periods, selfEmployed)  // enhanced-CPP deduction for THIS period
  const A = periods * (grossPay - f5a)                     // annual taxable income after F5A

  const T3 = applyBrackets(A, FEDERAL_BRACKETS_2026)

  const K1 = FEDERAL_LOWEST_RATE_2026 * (td1Credits ?? FEDERAL_BASIC_PERSONAL_2026)

  const baseCPPCreditBasis = calcCPPCreditBasis(annualPensionable, selfEmployed)
  const annualEICredit = Math.min(periods * ei, EI_2026.maxPremium)
  const K2 = FEDERAL_LOWEST_RATE_2026 * (baseCPPCreditBasis + annualEICredit)

  const K4 = Math.min(FEDERAL_LOWEST_RATE_2026 * annualGrossBox14, FEDERAL_LOWEST_RATE_2026 * CEA_2026)

  const T1 = Math.max(T3 - K1 - K2 - K4, 0)
  const perPeriodTax = T1 / periods

  return Math.max(Math.round(perPeriodTax * 100) / 100, 0)
}

/**
 * Calculate Alberta provincial income tax for a single pay period, mirroring
 * the federal method (K1P BPA credit + K2P CPP/EI credit). AB has no
 * provincial equivalent of the federal K4 employment-amount credit.
 */
function calcProvincialTax(grossPay, frequency, td1Credits, annualPensionable, cpp2, ei, selfEmployed) {
  const periods = PAY_PERIODS[frequency] || 26
  const f5a = calcF5A(annualPensionable, cpp2, periods, selfEmployed)
  const A = periods * (grossPay - f5a)

  const T4raw = applyBrackets(A, AB_BRACKETS_2026)

  const K1P = AB_LOWEST_RATE_2026 * (td1Credits ?? AB_BASIC_PERSONAL_2026)

  const baseCPPCreditBasis = calcCPPCreditBasis(annualPensionable, selfEmployed)
  const annualEICredit = Math.min(periods * ei, EI_2026.maxPremium)
  const K2P = AB_LOWEST_RATE_2026 * (baseCPPCreditBasis + annualEICredit)

  const K5P = Math.max((K1P + K2P - AB_K5P_THRESHOLD) * 0.25, 0)

  const T4 = Math.max(T4raw - K1P - K2P - K5P, 0)
  const perPeriodTax = T4 / periods

  return Math.max(Math.round(perPeriodTax * 100) / 100, 0)
}

/**
 * Full deduction calculation for one pay run.
 *
 * eiExemptOverride lets a single payroll run flip EI-exempt status without
 * touching the employee's saved default — useful for a mid-year change
 * (e.g. an employee hits their annual EI max with another employer) without
 * having to go edit the employee record first. Pass true/false to override,
 * or leave undefined to fall back to employee.ei_exempt.
 */
function calcDeductions(employee, grossPay, ytd = {}, eiExemptOverride = undefined) {
  const freq     = employee.pay_frequency || 'biweekly'
  const td1Fed   = Number(employee.td1_credits) || FEDERAL_BASIC_PERSONAL_2026
  // AB provincial uses AB basic personal — in future can store separately
  const td1AB    = AB_BASIC_PERSONAL_2026

  const selfEmployed = !!employee.self_employed
  // Self-employed individuals are always EI exempt, regardless of any flag.
  // Otherwise, an explicit per-run override wins over the employee's saved default.
  const eiExempt      = selfEmployed
    ? true
    : (eiExemptOverride !== undefined ? eiExemptOverride : !!employee.ei_exempt)

  const cppResult      = calcCPP(grossPay, freq, { cpp: ytd.cpp || 0, cpp2: ytd.cpp2 || 0 }, selfEmployed)
  const ei             = eiExempt ? 0 : calcEI(grossPay, freq, ytd.ei || 0)
  const federal_tax    = calcFederalTax(grossPay, freq, td1Fed, cppResult.annualPensionable, cppResult.cpp2, ei, selfEmployed)
  const provincial_tax = calcProvincialTax(grossPay, freq, td1AB, cppResult.annualPensionable, cppResult.cpp2, ei, selfEmployed)
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

/**
 * Employer-side amounts owed on top of what was withheld from the employee,
 * for CRA remittance purposes (this is what makes a "remittance slip" differ
 * from a pay stub — CRA wants employee-withheld + employer-matched amounts
 * together in one payment).
 *
 * - CPP and CPP2: employer matches the employee's contribution dollar-for-dollar.
 * - EI: employer pays 1.4x the employee's premium (standard multiplier outside Quebec).
 * - Income tax (federal + provincial): withheld only, no employer match — the
 *   employer just remits what was deducted from the employee.
 *
 * For a genuinely self-employed individual (no T4 employment relationship),
 * there's no employer match — they've already paid both CPP halves themselves
 * via the doubled self-employed rate, and self-employed CPP isn't remitted
 * through payroll at all (it's settled on the T1 return via Schedule 8).
 */
function calcEmployerAmounts(ded, employee) {
  const selfEmployed = !!employee.self_employed
  if (selfEmployed) {
    return {
      employer_cpp: 0,
      employer_cpp2: 0,
      employer_ei: 0,
      total_remittance: ded.total, // no separate remittance mechanism modeled here
    }
  }
  const employer_cpp  = ded.cpp
  const employer_cpp2 = ded.cpp2
  const employer_ei   = Math.round(ded.ei * EI_2026.employerMultiplier * 100) / 100

  const total_remittance = ded.cpp + ded.cpp2 + ded.ei + ded.federal_tax + ded.provincial_tax
    + employer_cpp + employer_cpp2 + employer_ei

  return { employer_cpp, employer_cpp2, employer_ei, total_remittance }
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
  .pr-btn: disabled:hover { background: none; }

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

/**
 * Builds a one-page printable remittance slip for a single payroll run —
 * shows what was withheld from the employee, what the employer owes on top
 * (CPP/CPP2 match + EI 1.4x), and the total that needs to be remitted to CRA.
 * orgName is passed in from activeOrg (adjust the field name in the caller
 * if your OrgContext doesn't expose `.name`).
 */
function generateRemittancePDF(run, entry, employee, orgName) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  let y = 56

  const teal = [13, 115, 119]
  const slate = [30, 41, 59]
  const slateMid = [71, 85, 105]
  const slateLt = [148, 163, 184]
  const border = [226, 232, 240]

  // ── Header ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...slate)
  doc.text('Payroll Remittance Slip', margin, y)
  y += 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...slateLt)
  doc.text(orgName || 'Company name not set', margin, y)
  y += 28

  doc.setDrawColor(...border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 22

  // ── Employee / period info ──
  doc.setFontSize(10)
  const infoRow = (label, value, x) => {
    doc.setTextColor(...slateLt)
    doc.text(label, x, y)
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'bold')
    doc.text(value, x, y + 14)
    doc.setFont('helvetica', 'normal')
  }
  infoRow('EMPLOYEE', employee?.name || '—', margin)
  infoRow('PAY PERIOD', `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`, margin + 200)
  infoRow('PAY DATE', fmtDate(run.pay_date), margin + 400)
  y += 40

  doc.line(margin, y, pageWidth - margin, y)
  y += 26

  // ── Section helper: two-column amount table ──
  const sectionTitle = (title) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...teal)
    doc.text(title, margin, y)
    y += 18
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
  }
  const row = (label, value, opts = {}) => {
    doc.setTextColor(...(opts.bold ? slate : slateMid))
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.text(label, margin + 10, y)
    doc.text(value, pageWidth - margin, y, { align: 'right' })
    y += 16
  }
  const divider = () => { doc.setDrawColor(...border); doc.line(margin, y - 6, pageWidth - margin, y - 6) }

  // Employee-withheld amounts
  sectionTitle('Withheld from employee')
  row('Gross pay', fmtCAD(entry.gross))
  row('CPP', fmtCAD(entry.cpp))
  if (Number(entry.cpp2) > 0) row('CPP2', fmtCAD(entry.cpp2))
  row('EI', fmtCAD(entry.ei))
  row('Federal tax', fmtCAD(entry.federal_tax))
  row('Provincial tax (AB)', fmtCAD(entry.provincial_tax))
  y += 6
  divider()
  y += 12
  row('Net pay to employee', fmtCAD(entry.net), { bold: true })
  y += 16

  // Employer-matched amounts
  sectionTitle('Employer contribution (matched)')
  if (employee?.self_employed) {
    doc.setTextColor(...slateLt)
    doc.setFontSize(9)
    doc.text('Self-employed — CPP already includes both employee and employer', margin + 10, y)
    y += 13
    doc.text('portions. Not remitted through T4 payroll; settled via Schedule 8', margin + 10, y)
    y += 13
    doc.text('on your T1 return.', margin + 10, y)
    y += 20
    doc.setFontSize(10)
  } else {
    row('CPP (employer match)', fmtCAD(entry.employer_cpp))
    if (Number(entry.employer_cpp2) > 0) row('CPP2 (employer match)', fmtCAD(entry.employer_cpp2))
    row('EI (employer, 1.4x)', fmtCAD(entry.employer_ei))
    y += 6
  }

  // ── Total remittance ──
  y += 10
  doc.setFillColor(30, 41, 59)
  doc.roundedRect(margin, y - 20, pageWidth - margin * 2, 46, 6, 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('TOTAL REMITTANCE DUE TO CRA', margin + 16, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(fmtCAD(entry.total_remittance ?? run.total_remittance), pageWidth - margin - 16, y + 4, { align: 'right' })
  y += 46

  // ── Footer ──
  y += 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...slateLt)
  doc.text(
    'Remittance due date depends on your CRA remitter type (regular, quarterly, threshold 1/2). ' +
    'Confirm your due date at canada.ca before submitting payment.',
    margin, y, { maxWidth: pageWidth - margin * 2 }
  )

  const fileName = `remittance-${employee?.name?.replace(/\s+/g, '-') || 'employee'}-${run.pay_date}.pdf`
  doc.save(fileName)
}

/**
 * Builds a one-page (or paginated) annual summary — one section per employee,
 * with a running total per pay run and a grand total at the bottom. Useful
 * for reconciling against your T4/T4A slips and CRA account balance at
 * year end.
 */
function generateYearEndSummaryPDF(year, runs, entries, empNameById, orgName) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 50
  let y = 56

  const teal = [13, 115, 119]
  const slate = [30, 41, 59]
  const slateMid = [71, 85, 105]
  const slateLt = [148, 163, 184]
  const border = [226, 232, 240]

  const runById = Object.fromEntries(runs.map(r => [r.id, r]))
  const byEmployee = {}
  for (const e of entries) {
    if (!byEmployee[e.employee_id]) byEmployee[e.employee_id] = []
    byEmployee[e.employee_id].push(e)
  }

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 60) {
      doc.addPage()
      y = 56
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...slate)
  doc.text(`${year} Payroll Remittance Summary`, margin, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...slateLt)
  doc.text(orgName || 'Company name not set', margin, y)
  y += 28
  doc.setDrawColor(...border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 32

  let grandTotal = { gross: 0, cpp: 0, cpp2: 0, ei: 0, fed: 0, prov: 0, empCpp: 0, empCpp2: 0, empEi: 0, remit: 0 }

  for (const [empId, empEntries] of Object.entries(byEmployee)) {
    ensureSpace(70)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...teal)
    doc.text(empNameById[empId] || 'Unknown employee', margin, y)
    y += 22

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...slateLt)
    const cols = [
      { label: 'PAY DATE', x: margin, align: 'left' },
      { label: 'GROSS', x: margin + 130, align: 'right' },
      { label: 'CPP+CPP2', x: margin + 210, align: 'right' },
      { label: 'EI', x: margin + 285, align: 'right' },
      { label: 'TAX', x: margin + 345, align: 'right' },
      { label: 'EMPLOYER', x: margin + 420, align: 'right' },
      { label: 'REMITTED', x: pageWidth - margin, align: 'right' },
    ]
    cols.forEach(c => doc.text(c.label, c.x, y, { align: c.align }))
    y += 12
    doc.setDrawColor(...border)
    doc.line(margin, y, pageWidth - margin, y)
    y += 20   // clear gap between the header rule and the first data row's text

    let empTotal = { gross: 0, remit: 0 }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...slateMid)

    for (const e of empEntries) {
      ensureSpace(18)
      const run = runById[e.payroll_run_id]
      const cppTot = Number(e.cpp || 0) + Number(e.cpp2 || 0)
      const empMatch = Number(e.employer_cpp || 0) + Number(e.employer_cpp2 || 0) + Number(e.employer_ei || 0)
      doc.text(fmtDate(run?.pay_date), margin, y)
      doc.text(fmtCAD(e.gross), margin + 130, y, { align: 'right' })
      doc.text(fmtCAD(cppTot), margin + 210, y, { align: 'right' })
      doc.text(fmtCAD(e.ei), margin + 285, y, { align: 'right' })
      doc.text(fmtCAD(Number(e.federal_tax) + Number(e.provincial_tax)), margin + 345, y, { align: 'right' })
      doc.text(fmtCAD(empMatch), margin + 420, y, { align: 'right' })
      doc.text(fmtCAD(e.total_remittance), pageWidth - margin, y, { align: 'right' })
      y += 18

      empTotal.gross += Number(e.gross || 0)
      empTotal.remit += Number(e.total_remittance || 0)
      grandTotal.gross += Number(e.gross || 0)
      grandTotal.cpp += Number(e.cpp || 0)
      grandTotal.cpp2 += Number(e.cpp2 || 0)
      grandTotal.ei += Number(e.ei || 0)
      grandTotal.fed += Number(e.federal_tax || 0)
      grandTotal.prov += Number(e.provincial_tax || 0)
      grandTotal.empCpp += Number(e.employer_cpp || 0)
      grandTotal.empCpp2 += Number(e.employer_cpp2 || 0)
      grandTotal.empEi += Number(e.employer_ei || 0)
      grandTotal.remit += Number(e.total_remittance || 0)
    }

    ensureSpace(26)
    y += 4   // small gap between the last data row and the subtotal rule
    doc.setDrawColor(...border)
    doc.line(margin, y - 8, pageWidth - margin, y - 8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...slate)
    doc.text('Subtotal', margin, y)
    doc.text(fmtCAD(empTotal.gross), margin + 130, y, { align: 'right' })
    doc.text(fmtCAD(empTotal.remit), pageWidth - margin, y, { align: 'right' })
    y += 34   // extra breathing room before the next employee section (or total box)
  }

  ensureSpace(56)
  doc.setFillColor(30, 41, 59)
  doc.roundedRect(margin, y - 20, pageWidth - margin * 2, 46, 6, 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`TOTAL REMITTED TO CRA — ${year}`, margin + 16, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(fmtCAD(grandTotal.remit), pageWidth - margin - 16, y + 4, { align: 'right' })
  y += 46

  y += 26
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...slateLt)
  doc.text(
    'Figures reflect the CRA rates in effect at the time each pay run was processed. ' +
    'Reconcile against your CRA remittance receipts and T4 slips before filing.',
    margin, y, { maxWidth: pageWidth - margin * 2 }
  )

  doc.save(`remittance-summary-${year}.pdf`)
}

const DEFAULT_FORM = { employee_id: '', period_start: '', period_end: '', pay_date: '', hours_worked: '', ei_exempt_override: null }

export default function Payroll() {
  const { activeOrg, isSuspended }  = useOrg()
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
  const [remittanceLoadingId, setRemittanceLoadingId] = useState(null)
  const [yearSummaryLoading, setYearSummaryLoading] = useState(false)
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear())

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

  const eiExemptEffective = useMemo(() => {
    if (!selectedEmp) return false
    if (selectedEmp.self_employed) return true
    return form.ei_exempt_override !== null ? form.ei_exempt_override : !!selectedEmp.ei_exempt
  }, [selectedEmp, form.ei_exempt_override])

  const deductionPreview = useMemo(() => {
    if (!selectedEmp || grossPreview <= 0) return { cpp: 0, cpp2: 0, ei: 0, federal_tax: 0, provincial_tax: 0, total: 0, net: 0 }
    return calcDeductions(selectedEmp, grossPreview, {}, form.ei_exempt_override !== null ? form.ei_exempt_override : undefined)
  }, [selectedEmp, grossPreview, form.ei_exempt_override])

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
      const eiOverride = form.ei_exempt_override !== null ? form.ei_exempt_override : undefined
      const ded   = calcDeductions(selectedEmp, gross, ytd, eiOverride)
      const employerAmt = calcEmployerAmounts(ded, selectedEmp)

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
          total_remittance:  employerAmt.total_remittance,
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
          employer_cpp:    employerAmt.employer_cpp,
          employer_cpp2:   employerAmt.employer_cpp2,
          employer_ei:     employerAmt.employer_ei,
          total_remittance: employerAmt.total_remittance,
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
    setStatusMsg(null)
    try {
      // Delete dependent entries first — if payroll_entries.payroll_run_id
      // doesn't have ON DELETE CASCADE, deleting the run directly would be
      // silently rejected by Postgres (FK violation), leaving the run in
      // place even though the UI looked like it succeeded.
      const { data: deletedEntries, error: entriesErr } = await supabase
        .from('payroll_entries')
        .delete()
        .eq('payroll_run_id', run.id)
        .eq('org_id', activeOrg.orgId)
        .select('id')
      if (entriesErr) throw entriesErr

      const { data: deletedRuns, error: runErr } = await supabase
        .from('payroll_runs')
        .delete()
        .eq('id', run.id)
        .eq('org_id', activeOrg.orgId)
        .select('id')
      if (runErr) throw runErr

      // Supabase Row Level Security doesn't throw an error when a policy
      // blocks a row — the delete call "succeeds" with 0 rows affected and
      // error stays null. Requesting the deleted rows back via .select()
      // lets us tell the difference between "actually deleted" and
      // "silently blocked by RLS" instead of assuming success either way.
      if (!deletedRuns || deletedRuns.length === 0) {
        throw new Error(
          'Nothing was deleted (0 rows affected). This is almost always a Supabase Row Level Security policy denying DELETE on payroll_runs (or payroll_entries) for your current role — check Table Editor → payroll_runs → Policies in Supabase.'
        )
      }

      setStatusMsg({ ok: true, text: `Run deleted (${deletedEntries?.length || 0} entr${deletedEntries?.length === 1 ? 'y' : 'ies'} removed).` })
      fetchAll()
    } catch (err) {
      setStatusMsg({ ok: false, text: `Could not delete run: ${err.message}` })
    }
  }

  // ── Remittance slip ──
  async function printRemittanceSlip(run) {
    setRemittanceLoadingId(run.id)
    try {
      const { data: entry, error: entryErr } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('payroll_run_id', run.id)
        .single()
      if (entryErr || !entry) throw new Error('Could not load payroll entry for this run.')

      const { data: employee, error: empErr } = await supabase
        .from('employees')
        .select('name, self_employed, ei_exempt')
        .eq('id', entry.employee_id)
        .single()
      if (empErr) throw new Error('Could not load employee for this run.')

      // Adjust `activeOrg.name` below if your OrgContext exposes the company
      // name under a different field (e.g. activeOrg.orgName, activeOrg.company_name)
      generateRemittancePDF(run, entry, employee, activeOrg?.name)
    } catch (err) {
      setStatusMsg({ ok: false, text: err.message })
    } finally {
      setRemittanceLoadingId(null)
    }
  }

  // ── Year-end remittance summary ──
  async function printYearEndSummary(year) {
    setYearSummaryLoading(true)
    try {
      const yearStart = `${year}-01-01`
      const yearEnd   = `${year}-12-31`

      const { data: yearRuns, error: runsErr } = await supabase
        .from('payroll_runs')
        .select('id, pay_date, total_gross, total_deductions, total_net, total_remittance')
        .eq('org_id', activeOrg.orgId)
        .gte('pay_date', yearStart)
        .lte('pay_date', yearEnd)
        .order('pay_date', { ascending: true })
      if (runsErr) throw runsErr
      if (!yearRuns || yearRuns.length === 0) {
        setStatusMsg({ ok: false, text: `No payroll runs found for ${year}.` })
        return
      }

      const runIds = yearRuns.map(r => r.id)
      const { data: yearEntries, error: entriesErr } = await supabase
        .from('payroll_entries')
        .select('payroll_run_id, employee_id, gross, cpp, cpp2, ei, federal_tax, provincial_tax, net, employer_cpp, employer_cpp2, employer_ei, total_remittance')
        .in('payroll_run_id', runIds)
      if (entriesErr) throw entriesErr

      const employeeIds = [...new Set((yearEntries || []).map(e => e.employee_id))]
      const { data: emps } = await supabase.from('employees').select('id, name').in('id', employeeIds)
      const empNameById = Object.fromEntries((emps || []).map(e => [e.id, e.name]))

      generateYearEndSummaryPDF(year, yearRuns, yearEntries || [], empNameById, activeOrg?.name)
    } catch (err) {
      setStatusMsg({ ok: false, text: err.message })
    } finally {
      setYearSummaryLoading(false)
    }
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
                  onChange={e => setForm(p => ({ ...p, employee_id: e.target.value, hours_worked: '', ei_exempt_override: null }))}>
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

            {selectedEmp && !selectedEmp.self_employed && (
              <div className="pr-field">
                <label>EI Status (this run)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={eiExemptEffective}
                    onChange={e => setForm(p => ({ ...p, ei_exempt_override: e.target.checked }))}
                  />
                  EI exempt for this run
                  {selectedEmp.ei_exempt && form.ei_exempt_override === null && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>(default for this employee)</span>
                  )}
                  {form.ei_exempt_override !== null && form.ei_exempt_override !== !!selectedEmp.ei_exempt && (
                    <span style={{ fontSize: 11, color: '#d97706' }}>(override — differs from employee default)</span>
                  )}
                </label>
              </div>
            )}

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
              ✓ Using 2026 CRA T4127 formulas — CPP 5.95% to $74,600 (max $4,230.45) + CPP2 4% to $85,000 (max $416) · EI 1.63% (max $1,123.07) · Federal brackets 14%–33% (BPA credit + CPP/EI credit + Canada Employment Amount credit applied) · Alberta brackets 8%–15% (BPA credit + CPP/EI credit applied)
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
            <SuspendedBanner />
          </form>
        </div>

        {/* Runs table */}
        <div className="pr-panel">
          <div className="pr-panel-header">
            <span className="pr-panel-title">Payroll History</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select className="pr-input pr-select" value={summaryYear}
                onChange={e => setSummaryYear(Number(e.target.value))}
                style={{ width: 100, fontSize: 12, padding: '6px 10px' }}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
              <button className="pr-btn" style={{ fontSize: 12, padding: '7px 14px' }}
                onClick={() => printYearEndSummary(summaryYear)} disabled={yearSummaryLoading || isSuspended}>
                {yearSummaryLoading ? 'Generating…' : `Export ${summaryYear} Remittance Summary`}
              </button>
            </div>
          </div>
          {statusMsg && (
            <div className={statusMsg.ok ? 'pr-status-ok' : 'pr-status-err'} style={{ margin: '0 22px 16px' }}>
              {statusMsg.ok ? '✓' : '⚠'} {statusMsg.text}
            </div>
          )}
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
                  <th style={{ width: 190 }}></th>
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
                          onClick={() => saveEdit(run.id)} disabled={editSaving || isSuspended}>
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
                        <button className="pr-btn" style={{ fontSize: 12, padding: '5px 12px' } }
                          onClick={() => printRemittanceSlip(run)} disabled={remittanceLoadingId === run.id}>
                          {remittanceLoadingId === run.id ? '…' : 'Slip'}
                        </button>
                        <button className="pr-btn" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => startEdit(run)} disabled={isSuspended}>
                          Edit
                        </button>
                        <button className="pr-btn pr-btn--danger" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => deleteRun(run)} disabled={isSuspended}>
                          Delete
                        </button>
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
