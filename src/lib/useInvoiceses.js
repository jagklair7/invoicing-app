//src/lib/useInvoices.js
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

export function useInvoices() {
  const { org } = useOrg()

  async function getInvoices() {
    if (!org) return []

    const { data } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('org_id', org.id)

    return data
  }

  return { getInvoices }
}