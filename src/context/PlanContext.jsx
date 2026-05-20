import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from './OrgContext'


const PlanContext = createContext(null)

const PLAN_DEFAULTS = {
  free:       { payroll: false, pay_stub_pdf: false, ytd: false, t4: false, multi_org: false, max_employees: 0,  max_invoices: 5,  max_orgs: 1  },
  starter:    { payroll: true,  pay_stub_pdf: true,  ytd: false, t4: false, multi_org: false, max_employees: 5,  max_invoices: 50, max_orgs: 1  },
  pro:        { payroll: true,  pay_stub_pdf: true,  ytd: true,  t4: false, multi_org: true,  max_employees: 25, max_invoices: -1, max_orgs: 5  },
  enterprise: { payroll: true,  pay_stub_pdf: true,  ytd: true,  t4: true,  multi_org: true,  max_employees: -1, max_invoices: -1, max_orgs: -1 },
}

function normalizeFeatures(rawFeatures = {}) {
  if (typeof rawFeatures !== 'object' || rawFeatures === null) {
    return {}
  }

  return Object.entries(rawFeatures).reduce((normalized, [key, value]) => {
    if (typeof value === 'string') {
      const lowered = value.toLowerCase()
      if (lowered === 'true') normalized[key] = true
      else if (lowered === 'false') normalized[key] = false
      else normalized[key] = value
    } else {
      normalized[key] = value
    }
    return normalized
  }, {})
}

export function PlanProvider({ children }) {
  const { activeOrg } = useOrg()
  const [plan, setPlan]         = useState(null)   // full plan row
  const [features, setFeatures] = useState(PLAN_DEFAULTS.free)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (activeOrg?.orgId) fetchPlan()
    else setLoading(false)
  }, [activeOrg?.orgId])

  async function fetchPlan() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('org_subscriptions')
        .select('*, plan:plan_id(*)')
        .eq('org_id', activeOrg.orgId)
        .single()

      if (data?.plan) {
        setPlan(data.plan)
        const normalizedFeatures = normalizeFeatures(data.plan.features)
        setFeatures({
          ...PLAN_DEFAULTS[data.plan.name] || PLAN_DEFAULTS.free,
          ...normalizedFeatures,
          max_employees: data.plan.max_employees,
          max_invoices:  data.plan.max_invoices,
          max_orgs:      data.plan.max_orgs,
          plan_name:     data.plan.name,
          status:        data.status,
          trial_ends_at: data.trial_ends_at,
        })
      } else {
        // No subscription found — default to free
        setFeatures({ ...PLAN_DEFAULTS.free, plan_name: 'free', status: 'active' })
      }
    } catch (err) {
      console.error('PlanContext error:', err)
      setFeatures({ ...PLAN_DEFAULTS.free, plan_name: 'free', status: 'active' })
    } finally {
      setLoading(false)
    }
  }

  // Helper: check if a feature is available
  function can(feature) {
    const value = features[feature]
    if (typeof value === 'boolean') return value
    return !!PLAN_DEFAULTS[features.plan_name]?.[feature]
  }

  // Helper: check if under a numeric limit (-1 = unlimited)
  function withinLimit(limitKey, currentCount) {
    const limit = features[limitKey]
    if (limit === -1) return true
    return currentCount < limit
  }

  return (
    <PlanContext.Provider value={{ plan, features, loading, can, withinLimit, refetch: fetchPlan }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider')
  return ctx
}