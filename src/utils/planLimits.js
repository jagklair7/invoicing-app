// src/utils/planLimits.js
// Shared plan-limit checks for invoices and organizations.
import { supabase } from '../app/supabaseClient'

const FREE_MONTHLY_INVOICE_LIMIT = 5
const FREE_MONTHS_BEFORE_LOCKOUT = 6

// Returns { allowed: boolean, reason?: string }
export async function checkCanCreateInvoice(orgId) {
  if (!orgId) return { allowed: false, reason: 'No active organization.' }

  const { data: sub } = await supabase
    .from('org_subscriptions')
    .select('plan_id, plans(name, max_invoices)')
    .eq('org_id', orgId)
    .single()

  const planName = sub?.plans?.name
  const maxInvoices = sub?.plans?.max_invoices

  // No subscription row, or a plan with unlimited invoices → allow
  if (!sub || maxInvoices === -1 || maxInvoices == null) {
    return { allowed: true }
  }

  // Non-free plans: flat monthly cap forever (per your existing plan values)
  if (planName !== 'free') {
    const count = await countInvoicesThisMonth(orgId)
    if (count >= maxInvoices) {
      return {
        allowed: false,
        reason: `You've reached your ${planName} plan's limit of ${maxInvoices} invoices this month. Upgrade to create more.`,
      }
    }
    return { allowed: true }
  }

  // Free plan: 5/month for the first 6 months (from first invoice), then 0/month
  const { data: firstInvoice } = await supabase
    .from('invoices')
    .select('created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstInvoice) {
    // No invoices yet — this will be their first, always allowed
    return { allowed: true }
  }

  const firstDate = new Date(firstInvoice.created_at)
  const now = new Date()
  const monthsElapsed =
    (now.getFullYear() - firstDate.getFullYear()) * 12 +
    (now.getMonth() - firstDate.getMonth())

  if (monthsElapsed >= FREE_MONTHS_BEFORE_LOCKOUT) {
    return {
      allowed: false,
      reason: 'Your free trial period has ended. Upgrade your plan to continue creating invoices.',
    }
  }

  const count = await countInvoicesThisMonth(orgId)
  if (count >= FREE_MONTHLY_INVOICE_LIMIT) {
    return {
      allowed: false,
      reason: `You've reached the Free plan's limit of ${FREE_MONTHLY_INVOICE_LIMIT} invoices this month. Upgrade to create more.`,
    }
  }

  return { allowed: true }
}

async function countInvoicesThisMonth(orgId) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', monthStart)
  return count || 0
}

// Returns full plan + usage info for the Settings page
export async function getPlanStatus(orgId, userId) {
  const { data: sub } = await supabase
    .from('org_subscriptions')
    .select('plan_id, status, plans(name, price_monthly, max_employees, max_invoices, max_orgs)')
    .eq('org_id', orgId)
    .single()

  const plan = sub?.plans || null
  
  const invoicesUsed = await countInvoicesThisMonth(orgId)

  const { count: employeesUsed } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  let orgsOwned = 0
  if (userId) {
    const { count } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
    orgsOwned = count || 0
  }

  return {
    planName: plan?.name || null,
    priceMonthly: plan?.price_monthly ?? null,
    maxInvoices: plan?.max_invoices ?? null,
    maxEmployees: plan?.max_employees ?? null,
    maxOrgs: plan?.max_orgs ?? null,
    invoicesUsed,
    employeesUsed: employeesUsed || 0,
    orgsOwned,
  }
}

// Returns { allowed: boolean, reason?: string }
export async function checkCanCreateOrg(userId) {
  if (!userId) return { allowed: false, reason: 'Not authenticated.' }

  const { data: ownedOrgs } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', userId)

  const orgCount = ownedOrgs?.length || 0
  if (orgCount === 0) return { allowed: true } // first org always allowed

  const orgIds = ownedOrgs.map(o => o.id)
  const { data: subs } = await supabase
    .from('org_subscriptions')
    .select('org_id, plans(max_orgs)')
    .in('org_id', orgIds)

  const maxOrgsValues = (subs || [])
    .map(s => s.plans?.max_orgs)
    .filter(v => v != null)

  if (maxOrgsValues.length === 0) {
    // No subscriptions found at all — fall back to Free's limit conservatively
    return orgCount >= 1
      ? { allowed: false, reason: 'Upgrade your plan to create additional organizations.' }
      : { allowed: true }
  }

  const effectiveMax = Math.max(...maxOrgsValues)
  if (effectiveMax === -1) return { allowed: true } // unlimited

  if (orgCount >= effectiveMax) {
    return {
      allowed: false,
      reason: `You've reached your plan's limit of ${effectiveMax} organization${effectiveMax === 1 ? '' : 's'}. Upgrade to create more.`,
    }
  }

  return { allowed: true }
}