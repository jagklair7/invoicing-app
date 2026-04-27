// src/context/OrgContext.jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../app/supabaseClient'

const OrgContext = createContext()

export function OrgProvider({ children }) {
  const [orgs, setOrgs]           = useState([])   // all orgs user belongs to
  const [activeOrg, setActiveOrg] = useState(null)  // currently selected org
  const [settings, setSettings]   = useState(null)  // org_settings for activeOrg
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading]     = useState(true)

  const loadOrgs = useCallback(async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      setOrgs([]); setActiveOrg(null); setSettings(null)
      setLoading(false); return
    }

    // Check if super_admin or owner
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('org_id, role, organizations(id, name, owner_id)')
      .eq('user_id', userData.user.id)

    if (!memberships?.length) {
      setOrgs([]); setActiveOrg(null); setLoading(false); return
    }

    const superAdmin = memberships.some(m =>
      m.role === 'super_admin' || m.role === 'owner'
    )
    setIsSuperAdmin(superAdmin)

    let allOrgs = memberships.map(m => ({
      orgId: m.org_id,
      name:  m.organizations?.name || 'Unknown',
      role:  m.role,
    }))

    // Super admin: also load ALL organizations
    if (superAdmin) {
      const { data: allOrgsData } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name')

      if (allOrgsData) {
        // Merge — keep role info for orgs already in memberships
        const memberOrgIds = new Set(allOrgs.map(o => o.orgId))
        const extra = allOrgsData
          .filter(o => !memberOrgIds.has(o.id))
          .map(o => ({ orgId: o.id, name: o.name, role: 'super_admin' }))
        allOrgs = [...allOrgs, ...extra]
      }
    }

    setOrgs(allOrgs)

    // Restore previously selected org from localStorage
    const savedOrgId = localStorage.getItem('activeOrgId')
    const saved = allOrgs.find(o => o.orgId === savedOrgId)
    const selected = saved || allOrgs[0]
    setActiveOrg(selected)

    // Load settings for selected org
    await loadSettings(selected.orgId)
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

  async function switchOrg(org) {
    setActiveOrg(org)
    localStorage.setItem('activeOrgId', org.orgId)
    await loadSettings(org.orgId)
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
      loading,
      switchOrg,
      refresh: loadOrgs,
      refreshSettings: () => activeOrg && loadSettings(activeOrg.orgId),
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
