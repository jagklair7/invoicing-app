// src/components/Layout.jsx
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'

// ── SVG icons ────────────────────────────────────────────────────────────────
const ProdIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
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
function EmpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M4.5 12c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5" stroke="currentColor" strokeWidth="1.5" opacity=".6"/>
      <path d="M2 14c0-2.5 2-4.5 6-4.5s6 2 6 4.5" stroke="currentColor" strokeWidth="1.5" opacity=".4"/>
    </svg>
  )
}
function PayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M4 6h8M4 10h8" stroke="currentColor" strokeWidth="1.2" opacity=".6"/>
      <path d="M8 3v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/>
      <path d="M8 11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/>
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
function AdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function StatsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="1" fill="currentColor" opacity=".85"/>
      <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity=".65"/>
      <rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" opacity=".4"/>
    </svg>
  )
}

function VendorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 6l1-4h10l1 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity=".85"/>
      <path d="M2 6h12v7a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function POIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
    </svg>
  )
}
function QuoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
      <circle cx="10.5" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity=".8"/>
      <path d="M12.3 12.3l1.2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/>
    </svg>
  )
}

function EstIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".85"/>
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
      <path d="M5 11h2M9 10l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/>
    </svg>
  )
}

// ── rest of the file continues as before...

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
  const location = useLocation()
  const { orgs, activeOrg, switchOrg, isSuperAdmin, loading: orgLoading } = useOrg()
  const { flags, loading: flagsLoading } = useFeatureFlags()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#0d7377', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Bypass routes (no sidebar needed) ────────────────────────────────────
  const bypassRoutes = ['/create-org', '/onboarding', '/auth/callback', '/login', '/signup']
  if (bypassRoutes.includes(location.pathname)) {
    return <>{children}</>
  }

  // ── No org yet ────────────────────────────────────────────────────────────
  if (!orgs || orgs.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 20, background: '#f8fafc' }}>
        <div style={{
          maxWidth: 480, width: '100%', background: 'white',
          borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 10px 30px rgba(15,23,42,.08)',
          padding: 40, textAlign: 'center'
        }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#0d7377', marginBottom: 8, fontFamily: 'Georgia, serif', letterSpacing: '-0.02em' }}>Klair</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Welcome</div>
          <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: 28, fontSize: 14 }}>
            Get started by creating your first organization to manage invoices, customers, and revenue.
          </p>
          <button
            onClick={() => navigate('/onboarding')}
            style={{ display: 'inline-block', padding: '11px 24px', background: '#0d7377', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', marginBottom: 16 }}
          >
            Create Organization
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
            style={{ display: 'block', width: '100%', padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Sidebar ── */}
      <aside style={{
        width: 224, Height: '100vh', background: 'white',
        borderRight: '1px solid #e2e8f0', display: 'flex',
        flexDirection: 'column', position: 'fixed',
        top: 0, left: 0, bottom: 0, zIndex: 40,
        overflowY: 'auto',
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
              fontFamily: 'Georgia, serif', letterSpacing: '-0.02em',
            }}>K</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a', lineHeight: 1.2 }}>Klair</div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Invoicing</div>
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
                  width: '100%', padding: '7px 28px 7px 10px',
                  fontSize: 12.5, fontWeight: 500, color: '#1e293b',
                  background: '#f8fafc', border: '1.5px solid #e2e8f0',
                  borderRadius: 8, outline: 'none', cursor: 'pointer',
                  appearance: 'none', fontFamily: 'inherit',
                }}
              >
                {orgs.map(o => (
                  <option key={o.orgId} value={o.orgId}>{o.name}</option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: 10 }}>▼</span>
            </div>
            {/* Create new org link */}
            <button
              onClick={() => navigate('/create-org')}
              style={{ marginTop: 6, fontSize: 11, color: '#0d7377', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: '2px 4px' }}
            >
              + New Organization
            </button>
          </div>
        )}

        {/* Main nav — filtered by feature flags */}
       <nav style={{ flex: '1 1 auto', minHeight: 0, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <NavItem to="/" label="Dashboard" icon={<DashIcon />} end />
          {flags.customers !== false && (
            <NavItem to="/customers" label="Customers" icon={<CustIcon />} />
          )}
          {flags.products !== false && (
            <NavItem to="/products" label="Products" icon={<ProdIcon />} />
          )}
          <NavItem to="/employees" label="Employees" icon={<EmpIcon />} />
          <NavItem to="/payroll" label="Payroll" icon={<PayIcon />} />
          {flags.invoices !== false && (
            <NavItem to="/invoices" label="Invoices" icon={<InvIcon />} />
          )}
          
          <NavItem to="/estimates" label="Estimates" icon={<EstIcon />} />
          <NavItem to="/quotes" label="Quotes" icon={<QuoteIcon />} />
          <NavItem to="/vendors" label="Vendors" icon={<VendorIcon />} />
          <NavItem to="/purchase-orders" label="Purchase Orders" icon={<POIcon />} />
          
        </nav>
       

        {/* Bottom nav */}
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid #f1f5f9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ padding: '0 6px 6px', fontSize: 10, fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Admin
          </div>

          {/* Super admin panel link */}
          {isSuperAdmin && (
            <NavItem to="/admin" label="Admin Panel" icon={<AdminIcon />} />
          )}
          {isSuperAdmin && (
            <NavItem to="/admin/analytics" label="Analytics" icon={<StatsIcon />} />
          )}
          {isSuperAdmin && (
            <NavItem to="/organizations" label="Organizations" icon={<OrgIcon />} />
          )}

          {flags.settings !== false && (
            <NavItem to="/settings" label="Settings" icon={<SetIcon />} />
          )}

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

        {/* Active org indicator */}
        {activeOrg && (
          <div style={{
            margin: '0 10px 12px', padding: '8px 10px',
            background: 'linear-gradient(135deg, #e8f5f5 0%, #f0fdfe 100%)',
            borderRadius: 8, border: '1px solid #b2e0e2',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ color: '#0d7377' }}><BuildingIcon /></span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#0d7377', lineHeight: 1.2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeOrg.name}</span>
                {activeOrg.role && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 9999,
                    background: activeOrg.role === 'owner' ? '#fef3c7' : activeOrg.role === 'admin' ? '#e0e7ff' : '#d9f7ef',
                    color: activeOrg.role === 'owner' ? '#b45309' : activeOrg.role === 'admin' ? '#1e40af' : '#0f766e',
                    whiteSpace: 'nowrap',
                  }}>
                    {activeOrg.role.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#5eadb0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active org</div>
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