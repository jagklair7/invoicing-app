// api/dashboard-metrics.js
//
// Read-only reporting endpoint for the Klair Dashboards app. Returns
// aggregated invoice data for one org. Deliberately narrow: no customer PII
// beyond an ID, no payment/card details even though those columns exist on
// `invoices` — only what a BI dashboard actually needs.
//
// AUTH: single shared secret via `Authorization: Bearer {key}`, checked
// against process.env.DASHBOARD_API_KEY. This is fine while it's only your
// own company's data flowing through it. If you start building dashboards
// for other clients later, upgrade to a per-org key in its own table instead
// of one shared secret — flag this file for a revisit at that point.
//
// CORS: the dashboards app calls this directly from the browser (its "Sync
// now" button), which is a cross-origin request from wherever that app is
// hosted — so this needs CORS headers, not just the API key check.
//
// REQUIRED Vercel env vars for this project (Settings → Environment
// Variables). Do NOT prefix these with VITE_ — that would bundle them into
// the client-side JS and expose them publicly:
//   SUPABASE_SERVICE_ROLE_KEY   — service role key for THIS Supabase project
//                                  (bypasses RLS — needed since this runs
//                                  with no user session, server-to-server)
//   DASHBOARD_API_KEY           — shared secret; the dashboards app's
//                                  data_sources.config.apiKey must match this
//   DASHBOARD_ALLOWED_ORIGIN    — the dashboards app's deployed origin,
//                                  e.g. https://dashboards.klair.ca
//                                  (optional — falls back to '*' if unset,
//                                  which works but is looser than necessary)

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const allowedOrigin = process.env.DASHBOARD_ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  // Browsers send an OPTIONS preflight before any request carrying an
  // Authorization header — has to succeed before the real GET is even sent.
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!process.env.DASHBOARD_API_KEY || token !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { org_id } = req.query
  if (!org_id) {
    return res.status(400).json({ error: 'Missing org_id query param' })
  }

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('date, total, status, number')
    .eq('org_id', org_id)
    .order('date', { ascending: true })

  if (error) {
    console.error('dashboard-metrics query failed:', error.message)
    return res.status(500).json({ error: 'Failed to load invoice data' })
  }

  return res.status(200).json({
    invoices: invoices || [],
  })
}