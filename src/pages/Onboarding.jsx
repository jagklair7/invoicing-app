// src/pages/Onboarding.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const css = `
.onboarding-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  font-family: 'DM Sans', sans-serif;
  padding: 24px;
}

.onboarding-card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  padding: 48px 40px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

.onboarding-logo {
  width: 40px;
  height: 40px;
  background: #0d7377;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin-bottom: 24px;
}

.onboarding-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

.onboarding-sub {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 32px;
  line-height: 1.5;
}

.onboarding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.onboarding-field label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.onboarding-input {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  outline: none;
  transition: border 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.onboarding-input:focus {
  border-color: #0d7377;
  background: #fff;
}

.onboarding-btn {
  width: 100%;
  padding: 12px;
  background: #0d7377;
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s;
}

.onboarding-btn:hover:not(:disabled) { background: #0a5f63; }
.onboarding-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.onboarding-error {
  font-size: 13px;
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}

.onboarding-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 24px 0;
}

.onboarding-signin {
  font-size: 13px;
  color: #64748b;
  text-align: center;
}

.onboarding-signin button {
  background: none;
  border: none;
  color: #0d7377;
  font-weight: 600;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  padding: 0;
}
`

export default function Onboarding() {
  const [orgName,  setOrgName]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const { refresh } = useOrg()
  const navigate    = useNavigate()

  async function handleCreate() {
    const name = orgName.trim()
    if (!name) return setError('Please enter an organization name.')
    setSaving(true)
    setError('')

    try {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated.')

  const { data, error: fnErr } = await supabase
    .rpc('create_organization', { org_name: orgName.trim() })
console.log('rpc data:', data)
console.log('rpc error:', fnErr)
  if (fnErr) throw fnErr

  const org = typeof data === 'string' ? JSON.parse(data) : data
console.log('parsed org:', org)
  localStorage.setItem('activeOrgId', org.id)
  await refresh()
  navigate('/', { replace: true })

} catch (err) {
  setError(err.message || 'Something went wrong.')
} finally {
  setSaving(false)
}
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <style>{css}</style>
      <div className="onboarding-wrap">
        <div className="onboarding-card">
          <div className="onboarding-logo">🏢</div>
          <h1 className="onboarding-title">Create your organization</h1>
          <p className="onboarding-sub">
            You're almost in! Set up your organization to get started.
            You can always change this later in Settings.
          </p>

          {error && <div className="onboarding-error">{error}</div>}

          <div className="onboarding-field">
            <label>Organization Name</label>
            <input
              className="onboarding-input"
              type="text"
              placeholder="e.g. Acme Corp"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <button
            className="onboarding-btn"
            onClick={handleCreate}
            disabled={saving || !orgName.trim()}
          >
            {saving ? 'Creating…' : 'Create Organization →'}
          </button>

          <div className="onboarding-divider" />

          <div className="onboarding-signin">
            Wrong account?{' '}
            <button onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  )
}