// src/components/Layout.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'

export default function Layout({ children }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Sidebar ── */}
      <aside className="w-56 bg-white border-r flex flex-col" style={{ minHeight: '100vh' }}>

        {/* Brand */}
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-2">
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#0d7377',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: 14
            }}>K</div>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Klair Invoicing</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {[
            { to: '/',          label: 'Dashboard', icon: '◈' },
            { to: '/customers', label: 'Customers',  icon: '◯' },
            { to: '/invoices',  label: 'Invoices',   icon: '◻' },
          ].map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                  isActive
                    ? 'bg-teal-50 text-teal-700 font-semibold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                ].join(' ')
              }
            >
              <span style={{ fontSize: 12, opacity: 0.7 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Settings + Logout */}
        <div className="px-3 py-4 border-t flex flex-col gap-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                isActive
                  ? 'bg-teal-50 text-teal-700 font-semibold'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              ].join(' ')
            }
          >
            <span style={{ fontSize: 12, opacity: 0.7 }}>⚙</span>
            Settings
          </NavLink>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all w-full text-left"
          >
            <span style={{ fontSize: 12, opacity: 0.7 }}>→</span>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>

    </div>
  )
}
