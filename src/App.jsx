// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './app/supabaseClient'

// Pages & Components
import Layout            from './components/Layout'
import InvoiceForm       from './pages/InvoiceForm.jsx'
import InvoiceView       from './pages/InvoiceView.jsx'
import Customers         from './pages/Customers'
import Invoices          from './pages/Invoices'
import Login             from './pages/Login.jsx'
import Signup            from './pages/Signup.jsx'
import AuthCallback      from './pages/AuthCallback.jsx'
import Settings          from './pages/Settings.jsx'
import Dashboard         from './pages/Dashboard.jsx'
import ProductsPage      from './pages/ProductsPage'
import Employees         from './pages/Employees.jsx'
import Payroll           from './pages/Payroll.jsx'
import CustomerStatement from './pages/CustomerStatement.jsx'
import CreateOrganization from './pages/CreateOrganization.jsx'
import Onboarding        from './pages/Onboarding.jsx'
import AdminPanel        from './pages/admin/AdminPanel.jsx'
import GlobalAnalytics   from './pages/admin/GlobalAnalytics.jsx'
import Organizations     from './pages/admin/Organizations.jsx'
import SeedPlans         from './pages/admin/SeedPlans.jsx'
import { OrgProvider, useOrg } from './context/OrgContext'
import OrgSwitcher       from './components/OrgSwitcher.jsx'

// ── Guards ────────────────────────────────────────────────────────────────────

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Redirects to /onboarding if user has no org yet
function OrgGuard({ session, children }) {
  const { orgs, loading } = useOrg()
  if (!session) return <Navigate to="/login" replace />
  if (loading) return null
  if (!orgs.length) return <Navigate to="/onboarding" replace />
  return children
}

// Only accessible if is_super_admin
function SuperAdminRoute({ session, children }) {
  const { isSuperAdmin, loading } = useOrg()
  if (!session) return <Navigate to="/login" replace />
  if (loading) return null
  if (!isSuperAdmin) return <Navigate to="/" replace />
  return children
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'DM Sans, sans-serif',
      fontSize: 14, color: '#94a3b8', background: '#f8fafc'
    }}>
      Loading…
    </div>
  )

  return (
    <OrgProvider>
      <Layout session={session}>
        <Routes>

          {/* ── Public ───────────────────────────────────────────────── */}
          <Route path="/login"         element={!session ? <Login />  : <Navigate to="/" replace />} />
          <Route path="/signup"        element={!session ? <Signup /> : <Navigate to="/" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* ── Onboarding (logged in but no org yet) ────────────────── */}
          <Route path="/onboarding" element={
            session ? <Onboarding /> : <Navigate to="/login" replace />
          } />

          {/* ── Create additional org (already has at least one) ─────── */}
          <Route path="/create-org" element={
            <ProtectedRoute session={session}><CreateOrganization /></ProtectedRoute>
          } />

          {/* ── Super Admin ──────────────────────────────────────────── */}
          <Route path="/admin" element={
            <SuperAdminRoute session={session}><AdminPanel /></SuperAdminRoute>
          } />
          <Route path="/admin/analytics" element={
            <SuperAdminRoute session={session}><GlobalAnalytics /></SuperAdminRoute>
          } />
          <Route path="/admin/seed-plans" element={
            <SuperAdminRoute session={session}><SeedPlans /></SuperAdminRoute>
          } />
          <Route path="/admin/*" element={
            <SuperAdminRoute session={session}><AdminPanel /></SuperAdminRoute>
          } />

          {/* ── App (requires org) ───────────────────────────────────── */}
          <Route path="/" element={
            <OrgGuard session={session}><Dashboard /></OrgGuard>
          } />
          <Route path="/customers" element={
            <OrgGuard session={session}><Customers /></OrgGuard>
          } />
          <Route path="/customers/:id/statement" element={
            <OrgGuard session={session}><CustomerStatement /></OrgGuard>
          } />
          <Route path="/invoices" element={
            <OrgGuard session={session}><Invoices /></OrgGuard>
          } />
          <Route path="/invoices/new" element={
            <OrgGuard session={session}><InvoiceForm /></OrgGuard>
          } />
          <Route path="/invoices/:id" element={
            <OrgGuard session={session}><InvoiceView /></OrgGuard>
          } />
          <Route path="/settings" element={
            <OrgGuard session={session}><Settings /></OrgGuard>
          } />
          <Route path="/products" element={
            <OrgGuard session={session}><ProductsPage /></OrgGuard>
          } />
          <Route path="/employees" element={
            <OrgGuard session={session}><Employees /></OrgGuard>
          } />
          <Route path="/payroll" element={
            <OrgGuard session={session}><Payroll /></OrgGuard>
          } />
          <Route path="/organizations" element={
            <SuperAdminRoute session={session}><Organizations /></SuperAdminRoute>
          } />

          {/* ── Catch-all ────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Layout>
    </OrgProvider>
  )
}