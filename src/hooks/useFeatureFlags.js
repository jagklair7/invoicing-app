// src/hooks/useFeatureFlags.js
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

export function useFeatureFlags() {
  const { activeOrg } = useOrg()
  const [flags, setFlags]     = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeOrg?.orgId) return
    fetchFlags(activeOrg.orgId)
  }, [activeOrg?.orgId])

  async function fetchFlags(orgId) {
    setLoading(true)

    // Fetch global defaults
    const { data: globals } = await supabase
      .from('feature_flags')
      .select('key, enabled')

    // Fetch org overrides
    const { data: overrides } = await supabase
      .from('org_feature_overrides')
      .select('flag_key, enabled')
      .eq('org_id', orgId)

    // Merge — override wins over global
    const overrideMap = Object.fromEntries(
      (overrides || []).map(o => [o.flag_key, o.enabled])
    )

    const merged = Object.fromEntries(
      (globals || []).map(f => [
        f.key,
        overrideMap[f.key] !== undefined ? overrideMap[f.key] : f.enabled
      ])
    )

    setFlags(merged)
    setLoading(false)
  }

  return { flags, loading }
}