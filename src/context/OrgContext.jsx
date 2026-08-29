// src/context/OrgContext.jsx
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../app/supabaseClient'

const OrgContext = createContext()

export function OrgProvider({ children }) {
  const [orgs, setOrgs]                 = useState([])
  const [activeOrg, setActiveOrg]       = useState(null)
  const [settings, setSettings]         = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [isSuspended, setIsSuspended]   = useState(false)
  const [loading, setLoading]           = useState(true)

  // Tracks whether the initial org load has completed. After that, background
  // re-validations (e.g. Supabase re-checking the session when the tab regains
  // focus) should NOT flip `loading` back to true — doing so causes Layout to
  // unmount and remount all page content, wiping any unsaved form state.
  const initializedRef = useRef(false)

  const loadOrgs = useCallback(async () => {
    if (!initializedRef.current) setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      setOrgs([]); setActiveOrg(null); setSettings(null); setIsSuspended(false)
      initializedRef.current = true
      setLoading(false); return
    }

    // ── Check super admin from profiles only ──────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userData.user.id)
      .single()
    const superAdmin = profile?.is_super_admin === true
    setIsSuperAdmin(superAdmin)

    // ── Load ONLY orgs this user belongs to ───────────────────────────
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('org_id, role, organizations(id, name)')
      .eq('user_id', userData.user.id)

    const allOrgs = (memberships || []).map(m => ({
      orgId: m.org_id,
      name:  m.organizations?.name || 'Unknown',
      role:  m.role,
    }))

    setOrgs(allOrgs)

    if (!allOrgs.length) {
      setActiveOrg(null); setSettings(null); setIsSuspended(false)
      initializedRef.current = true
      setLoading(false); return
    }

    // Restore previously selected org
    const savedOrgId = localStorage.getItem('activeOrgId')
    const saved      = allOrgs.find(o => o.orgId === savedOrgId)
    const selected   = saved || allOrgs[0]
    setActiveOrg(selected)
    await loadSettings(selected.orgId)
    await loadSubscriptionStatus(selected.orgId)
    initializedRef.current = true
    setLoading(false)
  }, [])

  async function loadSettings(orgId) {
    if (!orgId) return
    const { data } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('org_id', orgId)
      .single()
    setSettings(data || null)
  }

  async function loadSubscriptionStatus(orgId) {
    if (!orgId) { setIsSuspended(false); return }
    const { data } = await supabase
      .from('org_subscriptions')
      .select('status')
      .eq('org_id', orgId)
      .maybeSingle()
    setIsSuspended(data?.status === 'suspended')
  }

  async function switchOrg(org) {
    setActiveOrg(org)
    localStorage.setItem('activeOrgId', org.orgId)
    await loadSettings(org.orgId)
    await loadSubscriptionStatus(org.orgId)
  }

  useEffect(() => {
    loadOrgs()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadOrgs()
    })
    return () => subscription.unsubscribe()
  }, [loadOrgs])

  return (
    <OrgContext.Provider value={{
      orgs,
      activeOrg,
      settings,
      isSuperAdmin,
      isSuspended,
      loading,
      switchOrg,
      refresh: loadOrgs,
      refreshSettings: () => activeOrg && loadSettings(activeOrg.orgId),
      refreshSubscriptionStatus: () => activeOrg && loadSubscriptionStatus(activeOrg.orgId),
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)