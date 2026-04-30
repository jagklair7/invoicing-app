// src/components/OrgSwitcher.jsx
import { useOrg } from '../context/OrgContext'
import { useNavigate } from 'react-router-dom'

const css = `
.org-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(13,115,119,0.08);
  border: 1px solid rgba(13,115,119,0.2);
  border-radius: 10px;
  min-width: 0;
}

.org-switcher__badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
  background: #0d7377;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.org-switcher__select {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  min-width: 0;
  max-width: 200px;
  flex: 1;
}

.org-switcher__manage {
  font-size: 11px;
  font-weight: 600;
  color: #0d7377;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  padding: 0;
  white-space: nowrap;
  flex-shrink: 0;
  text-decoration: underline;
  opacity: 0.8;
}
.org-switcher__manage:hover { opacity: 1; }

.org-switcher__role {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #0d7377;
  background: #d1faf8;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.org-switcher__role--super_admin {
  color: white;
  background: #0d7377;
}

.org-switcher__role--owner {
  color: #b45309;
  background: #fef3c7;
}

.org-switcher__role--admin {
  color: #1e40af;
  background: #e0e7ff;
}

.org-switcher__role--member {
  color: #0f766e;
  background: #d9f7ef;
}
`

export default function OrgSwitcher() {
  const { orgs, activeOrg, switchOrg, isSuperAdmin, loading } = useOrg()
  const navigate = useNavigate()

  if (loading || !activeOrg) return null

  return (
    <>
      <style>{css}</style>
      <div className="org-switcher">
        {isSuperAdmin && (
          <span className="org-switcher__badge">Super Admin</span>
        )}

        {activeOrg?.role && (
          <span className={`org-switcher__role org-switcher__role--${activeOrg.role}`}>
            {activeOrg.role.replace('_', ' ')}
          </span>
        )}

        {orgs.length > 1 ? (
          <select
            className="org-switcher__select"
            value={activeOrg.orgId}
            onChange={e => {
              const selected = orgs.find(o => o.orgId === e.target.value)
              if (selected) switchOrg(selected)
            }}
          >
            {orgs.map(org => (
              <option key={org.orgId} value={org.orgId}>
                {org.name}{org.role ? ` (${org.role.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="org-switcher__select" style={{ cursor: 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeOrg.name}
            {activeOrg.role && (
              <span className={`org-switcher__role org-switcher__role--${activeOrg.role}`}>
                {activeOrg.role.replace('_', ' ')}
              </span>
            )}
          </span>
        )}

        {isSuperAdmin && (
          <button
            className="org-switcher__manage"
            onClick={() => navigate('/organizations')}
          >
            Manage
          </button>
        )}
      </div>
    </>
  )
}
