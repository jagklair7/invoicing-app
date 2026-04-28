// src/components/Layout.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const NAV_ITEMS = [
  { to: '/',             label: 'Dashboard',     icon: <DashIcon /> },
  { to: '/customers',   label: 'Customers',      icon: <CustIcon /> },
  { to: '/invoices',    label: 'Invoices',       icon: <InvIcon />  },
]

const BOTTOM_ITEMS = [
  { to: '/organizations', label: 'Organizations', icon: <OrgIcon />  },
  { to: '/settings',      label: 'Settings',      icon: <SetIcon />  },
]

// ── SVG icons ────────────────────────────────────────────────────────────────
function DashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
    </svg>
  )
}
function CustIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" fill="currentColor" opacity=".85"/>
      <path d="M2 13c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/>
    </svg>
  )
}
function InvIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function OrgIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="1" width="6" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <rect x="1" y="10" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <rect x="10" y="10" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M8 6v2.5M8 8.5H3.5V10M8 8.5H12.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function SetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/>
    </svg>
  )
}
function BuildingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 15V9h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 1h8l1 3H3L4 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => [
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-teal-50 text-teal-700'
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
      ].join(' ')}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-teal-600' : 'text-slate-400 group-hover:text-slate-600'}>
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const navigate = useNavigate()
  const { orgs, activeOrg, switchOrg, isSuperAdmin } = useOrg()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Sidebar ── */}
      <aside style={{
        width: 224,
        minHeight: '100vh',
        background: 'white',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 40,
      }}>

        {/* Brand */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #0d7377 0%, #14a0a5 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 15,
              boxShadow: '0 2px 8px rgba(13,115,119,0.3)',
              fontFamily: 'Georgia, serif',
              letterSpacing: '-0.02em',
            }}>K</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a', lineHeight: 1.2 }}>
                Klair
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Invoicing
              </div>
            </div>
          </div>
        </div>

        {/* Org switcher */}
        {orgs.length > 0 && (
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
              Organization
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={activeOrg?.orgId || ''}
                onChange={e => {
                  const selected = orgs.find(o => o.orgId === e.target.value)
                  if (selected) switchOrg(selected)
                }}
                style={{
                  width: '100%',
                  padding: '7px 28px 7px 10px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: '#1e293b',
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 8,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {orgs.map(o => (
                  <option key={o.orgId} value={o.orgId}>{o.name}</option>
                ))}
              </select>
              <span style={{
                position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: '#94a3b8', fontSize: 10,
              }}>▼</span>
            </div>
          </div>
        )}

        {/* Main nav */}
        <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem to="/"          label="Dashboard" icon={<DashIcon />} end />
          <NavItem to="/customers" label="Customers"  icon={<CustIcon />} />
          <NavItem to="/invoices"  label="Invoices"   icon={<InvIcon />}  />
        </nav>

        {/* Divider label */}
        <div style={{ padding: '0 16px 6px', fontSize: 10, fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Admin
        </div>

        {/* Bottom nav */}
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          {isSuperAdmin && (
            <NavItem to="/organizations" label="Organizations" icon={<OrgIcon />} />
          )}
          <NavItem to="/settings" label="Settings" icon={<SetIcon />} />

          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              fontSize: 14, fontWeight: 500,
              color: '#94a3b8', background: 'none', border: 'none',
              cursor: 'pointer', width: '100%', textAlign: 'left',
              transition: 'all 0.15s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fff5f5' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}
          >
            <LogoutIcon />
            Logout
          </button>
        </div>

        {/* Active org indicator at bottom */}
        {activeOrg && (
          <div style={{
            margin: '0 10px 12px',
            padding: '8px 10px',
            background: 'linear-gradient(135deg, #e8f5f5 0%, #f0fdfe 100%)',
            borderRadius: 8,
            border: '1px solid #b2e0e2',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ color: '#0d7377' }}><BuildingIcon /></span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0d7377', lineHeight: 1.2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeOrg.name}
              </div>
              <div style={{ fontSize: 10, color: '#5eadb0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active org
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main style={{ marginLeft: 224, flex: 1, padding: 24, minHeight: '100vh', background: '#f8fafc' }}>
        {children}
      </main>
    </div>
  )
}