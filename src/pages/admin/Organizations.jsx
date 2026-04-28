// src/pages/admin/Organizations.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../app/supabaseClient'
import { useOrg } from '../../context/OrgContext'
import { useNavigate } from 'react-router-dom'

const css = `
  .orgs-root {
    max-width: 860px;
    margin: 0 auto;
    font-family: 'DM Sans', sans-serif;
    padding: 28px 0 60px;
  }
  .orgs-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 28px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .orgs-title {
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
  }
  .orgs-sub {
    font-size: 13px;
    color: #94a3b8;
    margin: 4px 0 0;
  }

  /* Add org card */
  .orgs-add-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .orgs-add-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0d7377;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f1f5f9;
  }
  .orgs-add-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 12px;
    align-items: end;
  }
  @media (max-width: 600px) {
    .orgs-add-row { grid-template-columns: 1fr; }
  }
  .orgs-field { display: flex; flex-direction: column; gap: 5px; }
  .orgs-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .orgs-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    padding: 9px 12px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .orgs-input:focus {
    border-color: #0d7377;
    box-shadow: 0 0 0 3px rgba(13,115,119,0.1);
    background: white;
  }
  .orgs-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: background .15s;
    white-space: nowrap;
  }
  .orgs-btn--primary {
    background: #0d7377;
    color: white;
  }
  .orgs-btn--primary:hover { background: #14a0a5; }
  .orgs-btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .orgs-btn--ghost {
    background: #f1f5f9;
    color: #475569;
  }
  .orgs-btn--ghost:hover { background: #e2e8f0; }
  .orgs-btn--danger {
    background: #fff5f5;
    color: #e53e3e;
    border: 1px solid #fecaca;
  }
  .orgs-btn--danger:hover { background: #fee2e2; }

  .orgs-success {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #e8f5f5;
    border: 1px solid #b2e0e2;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #0d7377;
    font-weight: 500;
    margin-top: 12px;
  }
  .orgs-error {
    font-size: 12px;
    color: #e53e3e;
    margin-top: 6px;
  }

  /* Org list */
  .orgs-list { display: flex; flex-direction: column; gap: 12px; }

  .orgs-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    overflow: hidden;
    transition: box-shadow .15s;
  }
  .orgs-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }

  .orgs-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    gap: 12px;
    cursor: pointer;
  }
  .orgs-card-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .orgs-card-icon {
    width: 38px; height: 38px;
    border-radius: 10px;
    background: #e8f5f5;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .orgs-card-name {
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .orgs-card-meta {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .orgs-card-actions { display: flex; gap: 8px; flex-shrink: 0; }

  .orgs-card-body {
    border-top: 1px solid #f1f5f9;
    padding: 16px 20px;
    background: #fafbfc;
  }

  /* Member list */
  .orgs-members-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 10px;
  }
  .orgs-member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
    gap: 12px;
  }
  .orgs-member-row:last-child { border-bottom: none; }
  .orgs-member-email { font-size: 13px; color: #475569; }
  .orgs-role-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 20px;
    background: #e8f5f5;
    color: #0d7377;
  }
  .orgs-role-badge--owner { background: #fef3c7; color: #d97706; }
  .orgs-role-badge--super_admin { background: #0d7377; color: white; }

  /* Add member */
  .orgs-add-member {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    margin-top: 12px;
    align-items: center;
  }

  .orgs-stat-row {
    display: flex;
    gap: 20px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .orgs-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .orgs-stat-val {
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
  }
  .orgs-stat-lbl {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .orgs-spinner {
    width: 24px; height: 24px;
    border: 2px solid #e2e8f0;
    border-top-color: #0d7377;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    margin: 40px auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`

export default function Organizations() {
  const { isSuperAdmin, loading: contextLoading, refresh: refreshOrgs } = useOrg()
  const navigate = useNavigate()

  const [orgs, setOrgs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [members, setMembers]       = useState({}) // orgId -> members[]
  const [stats, setStats]           = useState({}) // orgId -> {invoices, customers}

  // New org form
  const [newOrgName, setNewOrgName]   = useState('')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [adding, setAdding]           = useState(false)
  const [addError, setAddError]       = useState('')
  const [addSuccess, setAddSuccess]   = useState('')

  // Add member form
  const [memberEmail, setMemberEmail]     = useState({})
  const [memberRole, setMemberRole]       = useState({})
  const [addingMember, setAddingMember]   = useState({})
  const [memberError, setMemberError]     = useState({})

  useEffect(() => {
    // 2. ONLY redirect if the context has FINISHED loading AND you aren't an admin
    if (!contextLoading && !isSuperAdmin) { navigate('/'); return }
    fetchOrgs()
  }, [isSuperAdmin, contextLoading, navigate])

    // 3. Show a spinner or nothing while the check is in progress
    if (contextLoading) return <div className="orgs-spinner" />

    // 4. If loading is done and you're still not an admin, don't render anything
    if (!isSuperAdmin) return null

  async function fetchOrgs() {
    setLoading(true)
    const { data } = await supabase
      .from('organizations')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: false })
    setOrgs(data || [])

    // Fetch stats for all orgs
    if (data?.length) {
      const [invRes, custRes] = await Promise.all([
        supabase.from('invoices').select('org_id, total, status'),
        supabase.from('customers').select('org_id'),
      ])
      const statsMap = {}
      data.forEach(o => {
        const invs = invRes.data?.filter(i => i.org_id === o.id) || []
        statsMap[o.id] = {
          invoices:  invs.length,
          customers: custRes.data?.filter(c => c.org_id === o.id).length || 0,
          revenue:   invs.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0),
        }
      })
      setStats(statsMap)
    }
    setLoading(false)
  }

  async function fetchMembers(orgId) {
    const { data } = await supabase
      .from('organization_members')
      .select('user_id, role, profiles(email, full_name)')
      .eq('org_id', orgId)
    setMembers(prev => ({ ...prev, [orgId]: data || [] }))
  }

  function toggleExpand(orgId) {
    if (expandedId === orgId) {
      setExpandedId(null)
    } else {
      setExpandedId(orgId)
      if (!members[orgId]) fetchMembers(orgId)
    }
  }

  async function handleAddOrg(e) {
    e.preventDefault()
    if (!newOrgName.trim()) return
    setAdding(true); setAddError(''); setAddSuccess('')

    try {
      const { data: userData } = await supabase.auth.getUser()

      // 1. Create org
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: newOrgName.trim(), owner_id: userData.user.id })
        .select()
        .single()
      if (orgErr) throw orgErr

      // 2. Create settings
      await supabase.from('organization_settings').insert({
        org_id:       org.id,
        company_name: newOrgName.trim(),
        company_email: newOrgEmail.trim() || null,
        invoice_prefix: 'INV-',
      })

      // 3. Add current user as super_admin member
      await supabase.from('organization_members').insert({
        org_id:  org.id,
        user_id: userData.user.id,
        role:    'super_admin',
      })

      setAddSuccess(`"${newOrgName.trim()}" created successfully!`)
      setNewOrgName(''); setNewOrgEmail('')
      await fetchOrgs()
      await refreshOrgs()
      setTimeout(() => setAddSuccess(''), 4000)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleAddMember(orgId) {
  const email = memberEmail[orgId]?.trim().toLowerCase()
  const role  = memberRole[orgId] || 'member'
  if (!email) return

  setAddingMember(prev => ({ ...prev, [orgId]: true }))
  setMemberError(prev => ({ ...prev, [orgId]: '' }))

  try {
    // Try profiles table first
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)  // case-insensitive match
      .single()

    let userId = profile?.id

    // Fall back to RPC if profiles lookup failed
    if (!userId) {
      const { data: rpcId } = await supabase
        .rpc('get_user_id_by_email', { email_input: email })
      userId = rpcId
    }

    if (!userId) throw new Error('No user found with that email. They must sign up first.')

    // Check if already a member
    const { data: existing } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single()

    if (existing) throw new Error('This user is already a member of this organization.')

    const { error } = await supabase.from('organization_members').insert({
      org_id:  orgId,
      user_id: userId,
      role,
    })
    if (error) throw error

    setMemberEmail(prev => ({ ...prev, [orgId]: '' }))
    await fetchMembers(orgId)
  } catch (err) {
    setMemberError(prev => ({ ...prev, [orgId]: err.message }))
  } finally {
    setAddingMember(prev => ({ ...prev, [orgId]: false }))
  }
}

  async function handleRemoveMember(orgId, userId) {
    if (!window.confirm('Remove this member from the org?')) return
    await supabase.from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
    await fetchMembers(orgId)
  }

  const fmt = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

  if (!isSuperAdmin) return null

  return (
    <>
      <style>{css}</style>
      <div className="orgs-root">

        {/* Header */}
        <div className="orgs-header">
          <div>
            <h1 className="orgs-title">Organizations</h1>
            <p className="orgs-sub">Super Admin — manage all tenants and their members</p>
          </div>
        </div>

        {/* Add org form */}
        <div className="orgs-add-card">
          <div className="orgs-add-title">Add New Organization</div>
          <form onSubmit={handleAddOrg}>
            <div className="orgs-add-row">
              <div className="orgs-field">
                <label className="orgs-label">Organization Name *</label>
                <input
                  className="orgs-input"
                  placeholder="e.g. Ramada Edmonton South"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  required
                />
              </div>
              <div className="orgs-field">
                <label className="orgs-label">Billing Email</label>
                <input
                  className="orgs-input"
                  type="email"
                  placeholder="billing@company.com"
                  value={newOrgEmail}
                  onChange={e => setNewOrgEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="orgs-btn orgs-btn--primary"
                disabled={adding || !newOrgName.trim()}
              >
                {adding ? 'Creating…' : '+ Add Org'}
              </button>
            </div>
            {addError   && <div className="orgs-error">⚠ {addError}</div>}
            {addSuccess && <div className="orgs-success">✓ {addSuccess}</div>}
          </form>
        </div>

        {/* Org list */}
        {loading ? (
          <div className="orgs-spinner" />
        ) : (
          <div className="orgs-list">
            {orgs.map(org => {
              const s = stats[org.id] || {}
              const expanded = expandedId === org.id
              return (
                <div key={org.id} className="orgs-card">
                  {/* Card header */}
                  <div className="orgs-card-header" onClick={() => toggleExpand(org.id)}>
                    <div className="orgs-card-left">
                      <div className="orgs-card-icon">🏢</div>
                      <div>
                        <div className="orgs-card-name">{org.name}</div>
                        <div className="orgs-card-meta">
                          Created {new Date(org.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#475569' }}>
                        <span><strong>{s.invoices || 0}</strong> invoices</span>
                        <span><strong>{s.customers || 0}</strong> customers</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>{fmt(s.revenue)}</span>
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {expanded && (
                    <div className="orgs-card-body">
                      <div className="orgs-members-title">Members</div>

                      {(members[org.id] || []).length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8', paddingBottom: 12 }}>No members yet.</div>
                      ) : (members[org.id] || []).map(m => (
                        <div key={m.user_id} className="orgs-member-row">
                          <div>
                            <div className="orgs-member-email">{m.profiles?.email || m.user_id}</div>
                            {m.profiles?.full_name && (
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.profiles.full_name}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`orgs-role-badge orgs-role-badge--${m.role}`}>{m.role}</span>
                            <button
                              className="orgs-btn orgs-btn--danger"
                              style={{ fontSize: 11, padding: '3px 10px' }}
                              onClick={() => handleRemoveMember(org.id, m.user_id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add member */}
                      <div className="orgs-add-member">
                        <input
                          className="orgs-input"
                          placeholder="user@email.com"
                          value={memberEmail[org.id] || ''}
                          onChange={e => setMemberEmail(prev => ({ ...prev, [org.id]: e.target.value }))}
                        />
                        <select
                          className="orgs-input"
                          style={{ width: 'auto' }}
                          value={memberRole[org.id] || 'member'}
                          onChange={e => setMemberRole(prev => ({ ...prev, [org.id]: e.target.value }))}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button
                          className="orgs-btn orgs-btn--primary"
                          onClick={() => handleAddMember(org.id)}
                          disabled={addingMember[org.id]}
                        >
                          {addingMember[org.id] ? 'Adding…' : 'Add Member'}
                        </button>
                      </div>
                      {memberError[org.id] && (
                        <div className="orgs-error">⚠ {memberError[org.id]}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
